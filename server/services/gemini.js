import { GoogleGenerativeAI } from '@google/generative-ai';
import projectState from '../state.js';

class GeminiService {
  constructor() {
    this.model = 'gemini-pro';
    this.client = null;
  }

  get apiKey() {
    return process.env.GEMINI_API_KEY;
  }

  async initialize() {
    if (!this.client && this.apiKey && this.apiKey !== 'votre_cle_api_gemini_ici') {
      const genAI = new GoogleGenerativeAI(this.apiKey);
      this.client = genAI.getGenerativeModel({ model: this.model });
    }
  }

  async isAvailable() {
    return !!this.apiKey && this.apiKey !== 'votre_cle_api_gemini_ici';
  }

  async complete(code, language, prompt) {
    if (!this.apiKey || this.apiKey === 'votre_cle_api_gemini_ici') {
      throw new Error("L'IA Gemini n'est pas disponible pour l'instant (Clé API non configurée).");
    }

    await this.initialize();

    const systemPrompt = `Tu es un assistant de programmation expert et un AGENT DE CODE AUTONOME.

MÉTHODOLOGIE :
1. ANALYSE : Prends le temps de lire tout le contexte et les fichiers fournis.
2. RÉFLEXION : Avant de répondre, pense étape par étape ("Chain of Thought").
3. ACTION : Utilise les commandes uniquement si nécessaire.

Création fichier: [CREATE_FILE: nom.ext]
Commande terminal: [RUN_COMMAND: commande]`;
    const userPrompt = prompt || `Analyse ce code et suggère des améliorations ou complète-le:\n\n${code}`;
    
    // Ajout d'instructions spécifiques pour la navigation et l'arrêt
    const searchInstructions = `
GUIDE D'ACTION :
1. NAVIGATION : "Ouvrir dossier X" = [RUN_COMMAND: cd X]. Ne fais pas juste 'ls' ou 'dir'.
2. ÉDIT : "Ouvrir fichier X" = [RUN_COMMAND: notepad X].
3. ARRÊT : Si le terminal répond "[SUCCESS] Ouverture de...", C'EST FINI. Ne rététe pas la commande.
4. RECHERCHE : Pour trouver, utilise 'Get-ChildItem -Recurse "nom"'.
5. CRÉATION (Terminal) : Si demandé par terminal -> [RUN_COMMAND: New-Item -Path "X" -ItemType File].
6. LECTURE LONGUE : Si la réponse contient [TRONQUÉ], utilise 'Get-Content Fichier -TotalCount 50' ou 'Select-Object -First 50' pour lire petit à petit.`;

    const fullPrompt = `${systemPrompt}\n${searchInstructions}\n\n${userPrompt}`;

    try {
      const result = await this.client.generateContent(fullPrompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Erreur Gemini:', error);
      throw new Error(`Gemini error: ${error.message}`);
    }
  }

  async chat(message, context = []) {
    if (!this.apiKey || this.apiKey === 'votre_cle_api_gemini_ici') {
      throw new Error("L'IA Gemini n'est pas disponible pour l'instant (Clé API non configurée).");
    }

    await this.initialize();

    const currentRoot = projectState.getRoot();

    // Construire le contexte
    let conversationHistory = `Tu es un EXPERT système Windows et PowerShell. Tu es un ROBOT ORCHESTRATEUR qui agit via un Terminal réel.

CAPACITÉS & OUTILS :
1. TERMINAL : [RUN_COMMAND: ta_commande]
   - Utilise TOUTES les commandes PowerShell réelles (ls, dir, cat, cd, etc.).
   - COMMANDE RÉELLE : 'close' : Ferme le fichier actif.
   - COMMANDE RÉELLE : 'close nom.ext' : Ferme spécifiquement l'onglet du fichier nommé.
2. ÉDITEUR : [CREATE_FILE: nom.ext] + bloc code : Crée/modifie un contenu. (Cela ouvre aussi un onglet).

RÈGLES D'OR :
- ANTI-BOUCLE : Si une commande échoue ou ne change rien, NE LA RÉPÈTE PAS. Si tu vois "[SUCCESS]", C'EST FINI.
- NAVIGATION : "Ouvrir dossier" = 'cd'. "Lister" = 'ls'. NE CONFONDS PAS.
- RECHERCHE INTELLIGENTE : Pour trouver un fichier, utilise 'Get-ChildItem -Recurse -Filter "nom"'. N'invente pas des chemins.
- CRÉATION PRUDENTE : Ne crée un fichier que si on te le demande ou si tu es SÛR qu'il manque pour faire fonctionner le projet. Ne recrée pas un fichier qui existe déjà ailleurs.
- RAISONNEMENT : Si on te dit que tu es dans "C:\Dossier", ne tente pas d'aller dans "C:\Dossier\teste" si tu sais qu'il n'existe pas.
- PLUS D'OUTILS VIRTUELS : N'utilise jamais [READ_FILE] ou [LIST_DIR]. Utilise 'cat' ou 'dir' via [RUN_COMMAND].
- ANTI-PARESSE : Si une tâche demande plusieurs étapes, commence immédiatement.
- ZÉRO HALLUCINATION : Ne simule jamais les sorties de commandes.
- CONSCIENCE : Tu as accès aux dernières sorties du terminal dans ton contexte système sous le tag [DERNIÈRES_SORTIES_TERMINAL]. Analyse-les pour corriger tes erreurs. Si la sortie est tronquée (...), sois plus précis dans tes commandes (ex: ls dossier_specifique).
- NAVIGATION : Si tu fais 'cd', le système te confirmera ton nouvel emplacement. Si tu es perdu, fais 'pwd' ou 'Get-Location'.

POSITION ACTUELLE : ${currentRoot}\n\n`;
    
    context.forEach(msg => {
      conversationHistory += `${msg.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${msg.content}\n`;
    });
    
    conversationHistory += `Utilisateur: ${message}`;

    try {
      const result = await this.client.generateContent(conversationHistory);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Erreur Gemini chat:', error);
      throw new Error(`Gemini error: ${error.message}`);
    }
  }
}

export default new GeminiService();
