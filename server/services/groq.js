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
        content: `Tu es un AGENT DE CODE AUTONOME opérant sur un système Windows réel.

TON EMPLACEMENT ACTUEL : ${currentRoot}

RÈGLES DE RÉPONSE :
1. PENSÉE : Tu peux utiliser des balises <think> pour raisonner, mais tes outils doivent rester en dehors.
2. SYNTAXE OUTILS : Utilise UNIQUEMENT le format [NOM_OUTIL: argument]. 
   EXEMPLE : [RUN_COMMAND: cd ..] ou [LIST_DIR]. 
   NE JAMAIS écrire [OUTIL: RUN_COMMAND] ou [COMMAND: ...].
3. NAVIGATION : Utilise impérativement [RUN_COMMAND: cd <chemin>] pour bouger.
4. ARRÊT : Arrête-toi immédiatement après un tag d'outil.`
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
