class DataManager {
    static KEYS = {
        HOF: 'flappy_hof_v2',
        STATE: 'flappy_save_state_v2'
    };

    static getHighScores() {
        const data = localStorage.getItem(this.KEYS.HOF);
        return data ? JSON.parse(data) : [];
    }

    static saveScore(score) {
        if (score === 0) return;
        let scores = this.getHighScores();

        // Add new score
        scores.push({ score, date: new Date().toLocaleDateString() });

        // Sort descending and keep top 5
        scores.sort((a, b) => b.score - a.score);
        scores = scores.slice(0, 5);

        localStorage.setItem(this.KEYS.HOF, JSON.stringify(scores));
    }

    static saveState(state) {
        localStorage.setItem(this.KEYS.STATE, JSON.stringify(state));
    }

    static loadState() {
        const data = localStorage.getItem(this.KEYS.STATE);
        return data ? JSON.parse(data) : null;
    }

    static clearState() {
        localStorage.removeItem(this.KEYS.STATE);
    }
}