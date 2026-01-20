import path from 'path';

class ProjectState {
  constructor() {
    this.currentRoot = process.cwd();
  }

  setRoot(newPath) {
    this.currentRoot = path.resolve(newPath);
    console.log(`🌐 [STATE] Racine globale mise à jour : ${this.currentRoot}`);
  }

  getRoot() {
    return this.currentRoot;
  }
}

export default new ProjectState();
