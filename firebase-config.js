// Firebase Configuration
// You'll need to replace these with your actual Firebase project credentials
const firebaseConfig = {
    // Replace these with your Firebase project configuration
    // Get these from: Firebase Console > Project Settings > General > Your apps > SDK setup and configuration
    apiKey: "your-api-key-here",
    authDomain: "your-project-id.firebaseapp.com",
    databaseURL: "https://your-project-id-default-rtdb.firebaseio.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get database reference
const database = firebase.database();

class FirebaseService {
    constructor() {
        this.learnersRef = database.ref('learners');
        this.transgressionsRef = database.ref('transgressions');
        this.isOnline = navigator.onLine;
        this.setupConnectionMonitoring();
    }

    setupConnectionMonitoring() {
        const connectedRef = database.ref('.info/connected');
        connectedRef.on('value', (snapshot) => {
            this.isOnline = snapshot.val();
            this.updateConnectionStatus();
        });

        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateConnectionStatus();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateConnectionStatus();
        });
    }

    updateConnectionStatus() {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            if (this.isOnline) {
                statusElement.textContent = 'Online';
                statusElement.className = 'connection-status online';
            } else {
                statusElement.textContent = 'Offline';
                statusElement.className = 'connection-status offline';
            }
        }
    }

    async saveLearners(learnersMap) {
        try {
            const learnersObject = {};
            learnersMap.forEach((learner, key) => {
                learnersObject[key] = learner;
            });
            await this.learnersRef.set(learnersObject);
            return true;
        } catch (error) {
            console.error('Error saving learners:', error);
            throw error;
        }
    }

    async loadLearners() {
        try {
            const snapshot = await this.learnersRef.once('value');
            const data = snapshot.val();
            const learnersMap = new Map();
            
            if (data) {
                Object.entries(data).forEach(([key, learner]) => {
                    learnersMap.set(key, learner);
                });
            }
            
            return learnersMap;
        } catch (error) {
            console.error('Error loading learners:', error);
            throw error;
        }
    }

    async updateLearner(learnerKey, learnerData) {
        try {
            await this.learnersRef.child(learnerKey).set(learnerData);
            return true;
        } catch (error) {
            console.error('Error updating learner:', error);
            throw error;
        }
    }

    async addTransgression(learnerKey, transgression) {
        try {
            const transgressionRef = this.transgressionsRef.push();
            const transgressionData = {
                ...transgression,
                learnerKey: learnerKey,
                id: transgressionRef.key
            };
            
            await transgressionRef.set(transgressionData);
            return transgressionData;
        } catch (error) {
            console.error('Error adding transgression:', error);
            throw error;
        }
    }

    onLearnersChanged(callback) {
        this.learnersRef.on('value', (snapshot) => {
            const data = snapshot.val();
            const learnersMap = new Map();
            
            if (data) {
                Object.entries(data).forEach(([key, learner]) => {
                    learnersMap.set(key, learner);
                });
            }
            
            callback(learnersMap);
        });
    }

    onTransgressionsChanged(callback) {
        this.transgressionsRef.on('value', (snapshot) => {
            const data = snapshot.val();
            const transgressions = [];
            
            if (data) {
                Object.entries(data).forEach(([key, transgression]) => {
                    transgressions.push({ ...transgression, id: key });
                });
            }
            
            callback(transgressions);
        });
    }

    // Backup to localStorage for offline functionality
    saveToLocalBackup(learnersMap) {
        try {
            const data = {
                learners: Array.from(learnersMap.entries()),
                timestamp: new Date().toISOString(),
                isBackup: true
            };
            localStorage.setItem('disciplineSystemBackup', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving local backup:', error);
        }
    }

    loadFromLocalBackup() {
        try {
            const stored = localStorage.getItem('disciplineSystemBackup');
            if (stored) {
                const data = JSON.parse(stored);
                return new Map(data.learners);
            }
            return new Map();
        } catch (error) {
            console.error('Error loading local backup:', error);
            return new Map();
        }
    }
}