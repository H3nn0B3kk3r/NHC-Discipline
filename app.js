class DisciplineSystem {
    constructor() {
        this.learners = new Map();
        this.transgressions = {
            homework: { name: 'Homework not done', points: 10 },
            late: { name: 'Late coming', points: 10 },
            books: { name: 'Books not at school', points: 10 },
            behavior: { name: 'Behavior', points: 15 },
            custom: { name: 'Other', points: 10 }
        };
        this.flagThreshold = 50;
        this.firebaseService = null;
        this.isLoading = false;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.initializeFirebase();
        this.updateDisplay();
    }

    async initializeFirebase() {
        try {
            this.firebaseService = new FirebaseService();
            
            // Load existing data from Firebase
            this.showLoading('Loading data...');
            this.learners = await this.firebaseService.loadLearners();
            this.updateLearnerDropdown();
            this.updateDisplay();
            this.hideLoading();

            // Set up real-time listeners
            this.firebaseService.onLearnersChanged((updatedLearners) => {
                if (!this.isLoading) {
                    this.learners = updatedLearners;
                    this.updateLearnerDropdown();
                    this.updateDisplay();
                }
            });

        } catch (error) {
            console.error('Firebase initialization failed:', error);
            this.showError('Cloud database connection failed. Using offline mode.');
            
            // Fallback to local storage
            this.loadFromStorage();
        }
    }

    setupEventListeners() {
        const excelFile = document.getElementById('excel-file');
        const learnerSearch = document.getElementById('learner-search');
        const learnerDropdown = document.getElementById('learner-dropdown');
        const transgressionSelect = document.getElementById('transgression-select');
        const customDescription = document.getElementById('custom-description');
        const addTransgressionBtn = document.getElementById('add-transgression');
        const searchRecords = document.getElementById('search-records');
        const filterStatus = document.getElementById('filter-status');
        const clearDatabaseBtn = document.getElementById('clear-database');

        excelFile.addEventListener('change', (e) => this.handleExcelUpload(e));
        learnerSearch.addEventListener('input', (e) => this.handleLearnerSearch(e));
        learnerDropdown.addEventListener('change', (e) => this.selectLearner(e));
        transgressionSelect.addEventListener('change', (e) => this.handleTransgressionSelect(e));
        addTransgressionBtn.addEventListener('click', () => this.addTransgression());
        searchRecords.addEventListener('input', (e) => this.filterRecords(e));
        filterStatus.addEventListener('change', (e) => this.filterRecords(e));
        clearDatabaseBtn.addEventListener('click', () => this.clearDatabase());
    }

    async handleExcelUpload(event) {
        const files = Array.from(event.target.files);
        const status = document.getElementById('upload-status');
        
        if (files.length === 0) return;

        this.showLoading(`Processing ${files.length} file${files.length > 1 ? 's' : ''}...`);
        status.textContent = `Processing ${files.length} file${files.length > 1 ? 's' : ''}...`;
        status.className = 'upload-status';

        let totalNewLearners = 0;
        let successfulFiles = 0;
        let failedFiles = [];

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const currentFile = i + 1;
                
                try {
                    this.updateProgress(`Processing file ${currentFile}/${files.length}: ${file.name}`);
                    
                    const data = await this.readExcelFile(file);
                    const initialCount = this.learners.size;
                    await this.processLearnerData(data);
                    const newLearnersFromFile = this.learners.size - initialCount;
                    
                    totalNewLearners += newLearnersFromFile;
                    successfulFiles++;
                    
                    console.log(`File "${file.name}" processed: ${newLearnersFromFile} new learners`);
                    
                } catch (error) {
                    console.error(`Error processing file "${file.name}":`, error);
                    failedFiles.push({ name: file.name, error: error.message });
                }
            }
            
            // Update UI and show results
            this.updateLearnerDropdown();
            this.hideLoading();
            
            // Create status message
            let statusMessage = `Successfully processed ${successfulFiles}/${files.length} files. `;
            statusMessage += `Added ${totalNewLearners} new learners to database!`;
            
            if (failedFiles.length > 0) {
                statusMessage += `\n\nFailed files: ${failedFiles.map(f => f.name).join(', ')}`;
            }
            
            status.textContent = statusMessage;
            status.className = failedFiles.length === 0 ? 'upload-status success' : 'upload-status warning';
            
        } catch (error) {
            console.error('Error during batch upload:', error);
            status.textContent = 'Error processing files. Please check the format.';
            status.className = 'upload-status error';
            this.hideLoading();
        }
    }

    readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const workbook = XLSX.read(e.target.result, { type: 'binary' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsBinaryString(file);
        });
    }

    async processLearnerData(data) {
        // First, try to detect if this is a structured class list
        const tableStart = this.findTableStart(data);
        const headers = tableStart >= 0 ? data[tableStart] : data[0];
        const startRow = tableStart >= 0 ? tableStart + 1 : 1;
        
        console.log('Table starts at row:', tableStart);
        console.log('Headers found:', headers);
        
        // Try to find structured class list columns
        const columnIndices = this.findClassListColumns(headers);
        
        let nameColumnIndex = -1;
        let gradeColumnIndex = -1;
        let surnameIndex = -1;
        let firstNameIndex = -1;
        
        if (columnIndices.surname >= 0 && columnIndices.firstName >= 0) {
            // Structured class list format
            surnameIndex = columnIndices.surname;
            firstNameIndex = columnIndices.firstName;
            console.log('Using structured format - Surname:', surnameIndex, 'First Name:', firstNameIndex);
        } else {
            // Fallback to original name detection
            nameColumnIndex = this.findNameColumn(headers);
            gradeColumnIndex = this.findGradeColumn(headers);
            console.log('Using fallback format - Name:', nameColumnIndex, 'Grade:', gradeColumnIndex);
        }

        if (nameColumnIndex === -1 && surnameIndex === -1) {
            const availableHeaders = headers.join(', ');
            throw new Error(`Name columns not found. Available columns: ${availableHeaders}. Please ensure columns contain 'Surname/Name' and 'First Name' or similar.`);
        }

        let newLearners = 0;
        const batch = [];

        // Extract grade from header section if available
        let gradeFromHeader = '';
        if (tableStart > 0) {
            gradeFromHeader = this.extractGradeFromHeader(data.slice(0, tableStart));
        }

        for (let i = startRow; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            let name = '';
            let grade = gradeFromHeader;

            if (surnameIndex >= 0 && firstNameIndex >= 0) {
                // Structured format: combine surname and first name
                const surname = String(row[surnameIndex] || '').trim();
                const firstName = String(row[firstNameIndex] || '').trim();
                
                if (surname || firstName) {
                    name = `${surname}${firstName ? (surname ? ', ' : '') + firstName : ''}`;
                }
            } else if (nameColumnIndex >= 0) {
                // Fallback format
                name = String(row[nameColumnIndex] || '').trim();
                if (gradeColumnIndex >= 0) {
                    grade = String(row[gradeColumnIndex] || '').trim() || gradeFromHeader;
                }
            }

            if (name && name.length > 1) {
                const learnerKey = `${name.toLowerCase()}_${grade.toLowerCase()}`;
                if (!this.learners.has(learnerKey)) {
                    const learnerData = {
                        name: name,
                        grade: grade,
                        demerits: [],
                        totalPoints: 0,
                        flagged: false,
                        lastUpdated: new Date().toISOString()
                    };
                    
                    this.learners.set(learnerKey, learnerData);
                    batch.push({ key: learnerKey, data: learnerData });
                    newLearners++;
                }
            }
        }

        console.log(`Processed ${newLearners} new learners`);

        // Save to Firebase if available
        if (this.firebaseService && batch.length > 0) {
            try {
                this.isLoading = true;
                await this.firebaseService.saveLearners(this.learners);
                this.isLoading = false;
            } catch (error) {
                console.error('Error saving to Firebase:', error);
                this.saveToStorage();
            }
        } else {
            this.saveToStorage();
        }
    }

    findTableStart(data) {
        // Look for rows that contain typical class list headers
        const headerPatterns = ['number', 'accession', 'learner', 'surname', 'firstname', 'first name', 'gender'];
        
        for (let i = 0; i < Math.min(data.length, 10); i++) {
            const row = data[i];
            if (!row || row.length < 3) continue;
            
            const rowText = row.map(cell => String(cell || '').toLowerCase().trim()).join(' ');
            const matchCount = headerPatterns.filter(pattern => rowText.includes(pattern)).length;
            
            // If we find at least 3 header patterns, this is likely the header row
            if (matchCount >= 3) {
                console.log(`Found table header at row ${i} with ${matchCount} matches:`, row);
                return i;
            }
        }
        
        return -1; // No structured table found, use default behavior
    }

    findClassListColumns(headers) {
        if (!headers || headers.length === 0) {
            return { surname: -1, firstName: -1 };
        }
        
        const surnamePatterns = ['surname', 'learner surname', 'last name', 'lastname', 'van'];
        const firstNamePatterns = ['first name', 'firstname', 'learner first name', 'name', 'given name'];
        
        let surnameIndex = -1;
        let firstNameIndex = -1;
        
        // Find surname column
        surnameIndex = headers.findIndex(header => 
            surnamePatterns.some(pattern => 
                String(header || '').toLowerCase().trim().includes(pattern)
            )
        );
        
        // Find first name column
        firstNameIndex = headers.findIndex(header => 
            firstNamePatterns.some(pattern => 
                String(header || '').toLowerCase().trim().includes(pattern)
            )
        );
        
        console.log('Column detection - Surname:', surnameIndex, 'First Name:', firstNameIndex);
        return { surname: surnameIndex, firstName: firstNameIndex };
    }

    extractGradeFromHeader(headerRows) {
        // Look for grade information in the header rows
        for (const row of headerRows) {
            if (!row) continue;
            
            for (const cell of row) {
                const cellText = String(cell || '').trim();
                
                // Match patterns like "Grade 07", "Class: 7A", "7A - NG NXUMALO"
                const gradeMatch = cellText.match(/(?:grade|class)[:\s]*(\d+[a-z]?)/i) ||
                                 cellText.match(/^(\d+[a-z]?)\s*[-\s]/i) ||
                                 cellText.match(/(\d+[a-z]?)(?:\s*-\s*[A-Z]+)/i);
                
                if (gradeMatch) {
                    console.log(`Extracted grade "${gradeMatch[1]}" from header: "${cellText}"`);
                    return gradeMatch[1];
                }
            }
        }
        
        return '';
    }

    findNameColumn(headers) {
        const namePatterns = ['name', 'student', 'learner', 'naam', 'leerder', 'surname', 'firstname', 'full name', 'fullname'];
        
        // First try exact matches
        let index = headers.findIndex(header => 
            namePatterns.some(pattern => 
                String(header).toLowerCase().trim() === pattern
            )
        );
        
        // If no exact match, try partial matches
        if (index === -1) {
            index = headers.findIndex(header => 
                namePatterns.some(pattern => 
                    String(header).toLowerCase().includes(pattern)
                )
            );
        }
        
        // If still not found, try first column if it looks like names
        if (index === -1 && headers.length > 0) {
            const firstHeader = String(headers[0]).toLowerCase();
            if (firstHeader.length > 0) {
                console.log(`Using first column "${headers[0]}" as name column`);
                return 0;
            }
        }
        
        return index;
    }

    findGradeColumn(headers) {
        const gradePatterns = ['grade', 'class', 'graad', 'klas', 'year', 'level', 'std', 'standard'];
        
        let index = headers.findIndex(header => 
            gradePatterns.some(pattern => 
                String(header).toLowerCase().includes(pattern)
            )
        );
        
        // If not found, try second column as grade
        if (index === -1 && headers.length > 1) {
            console.log(`Using second column "${headers[1]}" as grade column`);
            return 1;
        }
        
        return index;
    }

    handleLearnerSearch(event) {
        const searchTerm = event.target.value.toLowerCase();
        const dropdown = document.getElementById('learner-dropdown');
        
        dropdown.innerHTML = '<option value="">Select a learner...</option>';
        
        const filteredLearners = Array.from(this.learners.entries())
            .filter(([key, learner]) => 
                learner.name.toLowerCase().includes(searchTerm) || 
                learner.grade.toLowerCase().includes(searchTerm))
            .slice(0, 10);

        filteredLearners.forEach(([key, learner]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${learner.name}${learner.grade ? ` (Grade ${learner.grade})` : ''}`;
            dropdown.appendChild(option);
        });
    }

    updateLearnerDropdown() {
        const dropdown = document.getElementById('learner-dropdown');
        if (!dropdown) return;
        
        dropdown.innerHTML = '<option value="">Select a learner...</option>';
        
        const sortedLearners = Array.from(this.learners.entries())
            .sort(([,a], [,b]) => a.name.localeCompare(b.name));

        sortedLearners.forEach(([key, learner]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${learner.name}${learner.grade ? ` (Grade ${learner.grade})` : ''}`;
            dropdown.appendChild(option);
        });
    }

    selectLearner(event) {
        const learnerKey = event.target.value;
        const addBtn = document.getElementById('add-transgression');
        
        if (learnerKey && this.learners.has(learnerKey)) {
            this.displayLearnerInfo(learnerKey);
            addBtn.disabled = false;
        } else {
            this.clearLearnerInfo();
            addBtn.disabled = true;
        }
    }

    displayLearnerInfo(learnerKey) {
        const learner = this.learners.get(learnerKey);
        const infoDiv = document.getElementById('learner-info');
        
        const statusClass = this.getStatusClass(learner.totalPoints);
        
        infoDiv.innerHTML = `
            <div class="learner-card">
                <div>
                    <div class="learner-name">${learner.name}</div>
                    ${learner.grade ? `<div>Grade: ${learner.grade}</div>` : ''}
                </div>
                <div class="demerit-points ${statusClass}">
                    ${learner.totalPoints} points
                </div>
            </div>
            ${learner.demerits.length > 0 ? `
                <div style="margin-top: 15px;">
                    <strong>Recent Transgressions:</strong>
                    <ul class="transgression-list">
                        ${learner.demerits.slice(-5).map(demerit => `
                            <li class="transgression-item">
                                ${demerit.description} (${demerit.points} points)
                                <span class="date-stamp">${new Date(demerit.date).toLocaleDateString()}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            ` : ''}
        `;
    }

    getStatusClass(points) {
        if (points >= this.flagThreshold) return 'flagged';
        if (points >= this.flagThreshold * 0.7) return 'warning';
        return 'normal';
    }

    clearLearnerInfo() {
        document.getElementById('learner-info').innerHTML = '';
    }

    handleTransgressionSelect(event) {
        const value = event.target.value;
        const customInput = document.getElementById('custom-description');
        
        if (value === 'custom') {
            customInput.style.display = 'block';
            customInput.required = true;
        } else {
            customInput.style.display = 'none';
            customInput.required = false;
            customInput.value = '';
        }
    }

    async addTransgression() {
        const learnerKey = document.getElementById('learner-dropdown').value;
        const transgressionType = document.getElementById('transgression-select').value;
        const customDescription = document.getElementById('custom-description').value;

        if (!learnerKey || !transgressionType) {
            alert('Please select a learner and transgression type.');
            return;
        }

        if (transgressionType === 'custom' && !customDescription.trim()) {
            alert('Please provide a description for the other transgression.');
            return;
        }

        this.showLoading('Adding transgression...');

        const learner = this.learners.get(learnerKey);
        const transgression = this.transgressions[transgressionType];
        
        const demerit = {
            type: transgressionType,
            description: transgressionType === 'custom' ? customDescription.trim() : transgression.name,
            points: transgression.points,
            date: new Date().toISOString()
        };

        learner.demerits.push(demerit);
        learner.totalPoints += demerit.points;
        learner.flagged = learner.totalPoints >= this.flagThreshold;
        learner.lastUpdated = new Date().toISOString();

        try {
            // Update in Firebase
            if (this.firebaseService) {
                this.isLoading = true;
                await this.firebaseService.updateLearner(learnerKey, learner);
                await this.firebaseService.addTransgression(learnerKey, demerit);
                this.isLoading = false;
            } else {
                this.saveToStorage();
            }

            this.displayLearnerInfo(learnerKey);
            this.updateDisplay();
            this.hideLoading();

            // Clear form
            document.getElementById('transgression-select').value = '';
            document.getElementById('custom-description').value = '';
            document.getElementById('custom-description').style.display = 'none';

            if (learner.flagged && learner.totalPoints - demerit.points < this.flagThreshold) {
                alert(`⚠️ ${learner.name} has been flagged with ${learner.totalPoints} demerit points!`);
            }

        } catch (error) {
            console.error('Error adding transgression:', error);
            this.showError('Failed to save transgression. Please try again.');
            this.hideLoading();
        }
    }

    filterRecords(event) {
        this.updateDisplay();
    }

    updateDisplay() {
        const searchTerm = document.getElementById('search-records')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('filter-status')?.value || 'all';
        const recordsList = document.getElementById('records-list');

        if (!recordsList) return;

        const filteredLearners = Array.from(this.learners.entries())
            .filter(([key, learner]) => {
                const matchesSearch = learner.name.toLowerCase().includes(searchTerm);
                const matchesStatus = statusFilter === 'all' || 
                    (statusFilter === 'flagged' && learner.flagged) ||
                    (statusFilter === 'normal' && !learner.flagged);
                return matchesSearch && matchesStatus && learner.demerits.length > 0;
            })
            .sort(([,a], [,b]) => b.totalPoints - a.totalPoints);

        recordsList.innerHTML = filteredLearners.length === 0 ? 
            '<div style="text-align: center; color: #718096; padding: 40px;">No records found</div>' :
            filteredLearners.map(([key, learner]) => `
                <div class="record-item ${learner.flagged ? 'flagged' : ''}">
                    <div class="record-header">
                        <span class="record-name">${learner.name} ${learner.grade ? `(Grade ${learner.grade})` : ''}</span>
                        <span class="record-points">${learner.totalPoints} points</span>
                    </div>
                    <ul class="transgression-list">
                        ${learner.demerits.slice(-3).map(demerit => `
                            <li class="transgression-item">
                                ${demerit.description} (${demerit.points} points)
                                <span class="date-stamp">${new Date(demerit.date).toLocaleDateString()}</span>
                            </li>
                        `).join('')}
                        ${learner.demerits.length > 3 ? `
                            <li class="transgression-item" style="font-style: italic; opacity: 0.7;">
                                ... and ${learner.demerits.length - 3} more
                            </li>
                        ` : ''}
                    </ul>
                </div>
            `).join('');
    }

    updateProgress(message) {
        const status = document.getElementById('upload-status');
        if (status) {
            status.textContent = message;
            status.className = 'upload-status loading';
        }
        console.log(message);
    }

    showLoading(message = 'Loading...') {
        const spinner = document.getElementById('upload-spinner');
        const status = document.getElementById('upload-status');
        
        if (spinner) {
            spinner.style.display = 'block';
        }
        if (status) {
            status.textContent = message;
            status.className = 'upload-status loading';
        }
    }

    hideLoading() {
        const spinner = document.getElementById('upload-spinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }

    showError(message) {
        const status = document.getElementById('upload-status');
        if (status) {
            status.textContent = message;
            status.className = 'upload-status error';
        }
    }

    // Fallback methods for offline operation
    saveToStorage() {
        try {
            const data = {
                learners: Array.from(this.learners.entries()),
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('disciplineSystemData', JSON.stringify(data));
            
            // Also save to Firebase service for sync when online
            if (this.firebaseService) {
                this.firebaseService.saveToLocalBackup(this.learners);
            }
        } catch (error) {
            console.error('Error saving to storage:', error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem('disciplineSystemData');
            if (stored) {
                const data = JSON.parse(stored);
                this.learners = new Map(data.learners);
                this.updateLearnerDropdown();
                this.updateDisplay();
            }
        } catch (error) {
            console.error('Error loading from storage:', error);
        }
    }

    async clearDatabase() {
        // Double confirmation for safety
        const confirmation1 = confirm(
            '⚠️ CLEAR DATABASE WARNING ⚠️\n\n' +
            'This will permanently delete:\n' +
            '• All learner records\n' +
            '• All transgression history\n' +
            '• All demerit points\n\n' +
            'This action CANNOT be undone!\n\n' +
            'Are you absolutely sure you want to continue?'
        );

        if (!confirmation1) return;

        const confirmation2 = confirm(
            '🚨 FINAL CONFIRMATION 🚨\n\n' +
            'Please confirm: Do you want to DELETE ALL DATA?\n\n' +
            'Type of data that will be lost:\n' +
            '• Student names and grades\n' +
            '• All discipline records\n' +
            '• Flagged student information\n\n' +
            'Click OK to PERMANENTLY DELETE everything, or Cancel to keep your data.'
        );

        if (!confirmation2) return;

        try {
            this.showLoading('Clearing database...');

            // Clear local data
            this.learners.clear();
            
            // Clear Firebase if connected
            if (this.firebaseService) {
                try {
                    this.isLoading = true;
                    await this.firebaseService.saveLearners(new Map());
                    this.isLoading = false;
                } catch (error) {
                    console.error('Error clearing Firebase:', error);
                }
            }

            // Clear local storage
            localStorage.removeItem('disciplineSystemData');
            localStorage.removeItem('disciplineSystemBackup');

            // Reset UI
            this.updateLearnerDropdown();
            this.clearLearnerInfo();
            this.updateDisplay();
            
            // Clear form inputs
            document.getElementById('learner-search').value = '';
            document.getElementById('search-records').value = '';
            document.getElementById('filter-status').value = 'all';

            this.hideLoading();
            
            // Success message
            const status = document.getElementById('upload-status');
            status.textContent = '✅ Database cleared successfully! Ready for new data.';
            status.className = 'upload-status success';

            alert('✅ Database cleared successfully!\n\nYou can now upload new learner data for the new year/term.');

        } catch (error) {
            console.error('Error clearing database:', error);
            this.showError('Error clearing database. Please try again.');
            this.hideLoading();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DisciplineSystem();
});