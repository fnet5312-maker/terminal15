import { Ollama } from 'ollama';

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
Tu peux demander la création de fichiers via: [CREATE_FILE: fichier.ext]
Tu peux EXÉCUTER des commandes via: [RUN_COMMAND: commande]

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

    // Extraire la racine du message pour l'injecter dynamiquement dans le system prompt
    const rootMatch = message.match(/\[CONTEXTE: Racine=([^,\]]+)/);
    const currentRoot = rootMatch ? rootMatch[1] : 'Inconnue';

    // Nettoyer le contexte
    const cleanedContext = context.map(msg => ({
      role: msg.role === 'error' ? 'assistant' : msg.role,
      content: msg.content
    }));

    const messages = [
      { 
        role: 'system', 
        content: `Tu es un AGENT DE CODE AUTONOME sur Windows.
        
TON EMPLACEMENT ACTUEL : ${currentRoot}
Tu dois TOUJOURS considérer que tu es dans ce dossier au début de chaque réponse.

RÈGLES DÉTERMINANTES :
1. NAVIGATION : Pour changer de dossier, tu DOIS utiliser [RUN_COMMAND: cd <chemin>]. Déclarer "Je me déplace dans..." sans utiliser le tag ne change rien.
2. VÉRITÉ : Ne jamais inventer le contenu d'un dossier. Si tu ne l'as pas listé avec [LIST_DIR], tu ne sais pas ce qu'il contient.
3. CONTEXTE : Ton emplacement réel est défini par la Racine dans [CONTEXTE] ou ton dernier 'cd' réussi.
4. ARRÊT : Après avoir écrit un tag d'outil (ex: [LIST_DIR]), arrête-toi immédiatement.`
      },
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
