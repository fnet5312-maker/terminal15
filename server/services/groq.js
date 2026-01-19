import Groq from 'groq-sdk';

class GroqService {
  constructor() {
    this.model = 'qwen/qwen3-32b';
    this.client = null;
  }

  get apiKey() {
    return process.env.GROQ_API_KEY;
  }

  async initialize() {
    if (!this.client && this.apiKey) {
      console.log('Initialisation Groq avec clé:', this.apiKey.substring(0, 7) + '...');
      this.client = new Groq({ apiKey: this.apiKey });
    }
  }

  async isAvailable() {
    return !!this.apiKey && !this.apiKey.includes('votre_cle');
  }

  async complete(code, language, prompt) {
    if (!this.apiKey || this.apiKey.includes('votre_cle') || this.apiKey.length < 10) {
      console.error('Groq non configuré. Clé actuelle:', this.apiKey);
      throw new Error("L'IA Groq n'est pas disponible pour l'instant (Clé API non valide dans .env).");
    }

    await this.initialize();

    const systemPrompt = `Tu es un assistant de programmation expert et un AGENT DE CODE AUTONOME.
Tu peux demander la création de fichiers en utilisant le format:
[CREATE_FILE: chemin/du/fichier.ext]
\`\`\`
contenu
\`\`\`

Tu peux aussi EXÉCUTER des commandes dans le terminal avec:
[RUN_COMMAND: commande]

Aide l'utilisateur avec son code ${language || 'JavaScript'}.`;
    const userPrompt = prompt || `Analyse ce code et suggère des améliorations ou complète-le:\n\n${code}`;

    try {
      const completion = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: this.model,
        temperature: 0.7,
        max_tokens: 2048
      });

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Erreur Groq (Complete):', error.response?.data || error.message);
      throw new Error(`Groq error: ${error.message}`);
    }
  }

  async chat(message, context = []) {
    if (!this.apiKey || this.apiKey.includes('votre_cle') || this.apiKey.length < 10) {
      throw new Error("L'IA Groq n'est pas disponible pour l'instant (Clé API non valide dans .env).");
    }

    await this.initialize();

    // Extraire la racine du message pour l'injecter dynamiquement
    const rootMatch = message.match(/\[CONTEXTE: Racine=([^,\]]+)/);
    const currentRoot = rootMatch ? rootMatch[1] : 'Inconnue';

    // Nettoyer le contexte pour ne garder que role et content (Groq rejette les propriétés inconnues comme 'provider')
    const cleanedContext = context.map(msg => ({
      role: msg.role === 'error' ? 'assistant' : msg.role,
      content: msg.content
    }));

    const messages = [
      { 
        role: 'system', 
        content: `Tu es l'ORCHESTRATEUR de ce système Windows. Tu agis via le Terminal.

RÈGLES DE SURVIE ET D'APPRENTISSAGE :
1. POSITION RÉELLE : Ta position est STRICTEMENT celle indiquée par 'VOTRE NOUVELLE POSITION RÉELLE' dans les résultats d'outils.
2. CRÉATION DE FICHIER : Pour créer un fichier avec du contenu, utilise impérativement [CREATE_FILE: nom.ext] suivi d'un bloc de code. Ne jamais utiliser 'echo >' qui échoue avec les caractères spéciaux.
3. NE JAMAIS ANTICIPER : N'écris jamais le résultat supposé d'une commande dans ton message. Écris SEULEMENT le tag.
4. ANALYSE : Si tu reçois [ERREUR TERMINAL], propose une correction basée sur le chemin réel affiché.
5. UN SEUL MOUVEMENT : Si tu dois naviguer (cd), ne fais qu'une seule commande cd à la fois.

TON EMPLACEMENT ACTUEL : ${currentRoot}
ARRÊT : Arrête ton message immédiatement après avoir fermé le crochet ].`
      },
      ...cleanedContext,
      { role: 'user', content: message }
    ];

    try {
      const completion = await this.client.chat.completions.create({
        messages,
        model: this.model,
        temperature: 0.7,
        max_tokens: 2048
      });

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Erreur Groq (Chat):', error.response?.data || error.message);
      throw new Error(`Groq error: ${error.message}`);
    }
  }
}

export default new GroqService();
