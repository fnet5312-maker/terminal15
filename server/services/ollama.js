import { Ollama } from 'ollama';
import projectState from '../state.js';

class OllamaService {
  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = 'qwen2.5-coder:3b';
    this.client = null;
  }

  async initialize() {
    if (!this.client) {
      this.client = new Ollama({ host: this.baseUrl });
    }
  }

  async isAvailable() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      // Ne pas logger en erreur pour ne pas polluer la console si Ollama n'est pas lancé
      return false;
    }
  }

  async complete(code, language, prompt) {
    if (!(await this.isAvailable())) {
      throw new Error("L'IA Ollama n'est pas disponible. Assurez-vous qu'Ollama est lancé localement.");
    }
    await this.initialize();

    const systemPrompt = `Tu es un assistant de programmation expert et un AGENT DE CODE AUTONOME.

MÉTHODOLOGIE :
1. ANALYSE : Lis attentivement le contexte.
2. RÉFLEXION : Pense étape par étape avant d'agir.
3. ACTION : Exécute les tâches demandées avec précision.

Tu peux demander la création de fichiers via: [CREATE_FILE: fichier.ext]
Tu peux EXÉCUTER des commandes via: [RUN_COMMAND: commande]

ACTIONS CLÉS :
1. "Ouvrir dossier" -> Utilise 'cd dossier'.
2. "Ouvrir fichier" -> Utilise 'notepad fichier'.
3. STOP -> Si tu vois "[SUCCESS]" dans la réponse précédente, ARRÊTE.
4. CRÉATION TERMINAL -> Si demandé explicitement : [RUN_COMMAND: New-Item -Path "fichier" -ItemType File].
5. TRONQUÉ -> Si tu vois [TRONQUÉ], affine ta commande (ex: Select-Object -First 20) pour lire moins de données à la fois.

Aide l'utilisateur avec son code ${language || 'JavaScript'}.`;
    
    const userPrompt = prompt || `Analyse ce code et suggère des améliorations ou complète-le:\n\n${code}`;

    try {
      const response = await this.client.chat({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false
      });

      return response.message.content;
    } catch (error) {
      console.error('Erreur Ollama:', error);
      throw new Error(`Ollama error: ${error.message}`);
    }
  }

  async chat(message, context = []) {
    if (!(await this.isAvailable())) {
      throw new Error("L'IA Ollama n'est pas disponible. Assurez-vous qu'Ollama est lancé localement.");
    }
    await this.initialize();

    const currentRoot = projectState.getRoot();
    const systemPrompt = `Tu es un EXPERT système Windows et PowerShell. Tu es un ROBOT ORCHESTRATEUR qui agit via un Terminal réel.

CAPACITÉS & OUTILS :
1. TERMINAL : [RUN_COMMAND: ta_commande]
   - Utilise TOUTES les commandes PowerShell réelles (ls, dir, cat, cd, etc.).
   - COMMANDE RÉELLE : 'close' : Ferme le fichier/onglet actif.
   - COMMANDE RÉELLE : 'close nom.ext' : Ferme spécifiquement l'onglet du fichier indiqué.
2. ÉDITEUR : [CREATE_FILE: nom.ext] + bloc code : Crée/modifie un contenu (Ouvre/crée un onglet).

RÈGLES D'OR :
- ANTI-BOUCLE : Si le terminal dit "[SUCCESS]", STOP. Ne répète pas.
- NAVIGATION : Ouvrir un dossier = 'cd'. Lister = 'ls'.
- RECHERCHE INTELLIGENTE : Pour trouver un fichier, utilise 'Get-ChildItem -Recurse -Filter "nom"'.
- CRÉATION PRUDENTE : Ne crée pas de fichiers au hasard si tu ne les trouves pas immédiatement. Cherche mieux.
- RAISONNEMENT : Si on te dit que tu es dans "C:\Dossier", ne tente pas d'aller dans "C:\Dossier\teste" si tu sais qu'il n'existe pas.
- PLUS D'OUTILS VIRTUELS : N'utilise jamais [READ_FILE] ou [LIST_DIR]. Utilise 'cat' ou 'dir' via [RUN_COMMAND].
- ANTI-PARESSE : Si une tâche demande plusieurs étapes, commence immédiatement.
- ZÉRO HALLUCINATION : Ne simule jamais les sorties de commandes.
- NAVIGATION : Si tu fais 'cd', le système te confirmera ton nouvel emplacement.
- CONSCIENCE : Tu as accès aux dernières sorties du terminal dans ton contexte système sous [DERNIÈRES_SORTIES_TERMINAL]. Analyse ces résultats pour valider tes actions ou corriger tes erreurs. Si la sortie est coupée, sois plus précis.

POSITION ACTUELLE : ${currentRoot}`;

    const cleanedContext = context.map(msg => ({
      role: msg.role === 'error' ? 'assistant' : (msg.role === 'user' ? 'user' : 'assistant'),
      content: msg.content
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...cleanedContext,
      { role: 'user', content: message }
    ];

    try {
      const response = await this.client.chat({
        model: this.model,
        messages,
        stream: false
      });

      return response.message.content;
    } catch (error) {
      console.error('Erreur Ollama chat:', error);
      throw new Error(`Ollama error: ${error.message}`);
    }
  }
}

export default new OllamaService();
