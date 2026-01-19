import { GoogleGenerativeAI } from '@google/generative-ai';

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
Création fichier: [CREATE_FILE: nom.ext]
Commande terminal: [RUN_COMMAND: commande]`;
    const userPrompt = prompt || `Analyse ce code et suggère des améliorations ou complète-le:\n\n${code}`;

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

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

    // Extraire la racine
    const rootMatch = message.match(/\[CONTEXTE: Racine=([^,\]]+)/);
    const currentRoot = rootMatch ? rootMatch[1] : 'Inconnue';

    // Construire le contexte
    let conversationHistory = `Tu es l'ORCHESTRATEUR de ce système. Tu diriges le terminal.

RÈGLES D'APPRENTISSAGE :
1. ANALYSE : Lis systématiquement le retour [SUCCÈS/ERREUR TERMINAL].
2. CRÉATION : Utilise [CREATE_FILE: nom.ext] + bloc de code pour créer des fichiers. Ne pas utiliser 'echo'.
3. RÉALITÉ : Ne décris pas d'emplacements fictifs. Fie-toi uniquement à ta POSITION RÉELLE reçue.
4. CORRECTION : Si une commande échoue, rectifie ton tir immédiatement.

EMPLACEMENT ACTUEL : ${currentRoot}\n\n`;
    
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
