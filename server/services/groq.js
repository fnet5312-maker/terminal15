import Groq from 'groq-sdk';
import projectState from '../state.js';

class GroqService {
  constructor() {
    this.model = 'openai/gpt-oss-120b';
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

    // Nettoyer le contexte : seules les valeurs user/assistant/system sont acceptées. On rabat tout le reste en assistant.
    const cleanedContext = context
      .filter(msg => msg && msg.content) // ignorer les entrées vides
      .map(msg => {
        const normalizedRole = msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
          ? msg.role
          : 'assistant'; // ex: system_log, error -> assistant pour éviter l'erreur "discriminator property 'role' invalid"
        const content = typeof msg.content === 'string' && msg.content.length > 4000 
          ? msg.content.slice(0, 4000) + "... [Contenu tronqué pour économiser les tokens]" 
          : msg.content;
        return { role: normalizedRole, content };
      });

    const currentDir = projectState.getRoot();
    const systemPrompt = `Tu es un EXPERT système Windows et PowerShell. Tu es un ROBOT ORCHESTRATEUR qui agit via un Terminal réel.

MÉTHODOLOGIE "SLOW THINKING" :
- Ne te précipite pas.
- Analyse chaque ligne de retour du terminal (surtout les erreurs).
- Si une commande échoue, analyse POURQUOI avant de réessayer.

IMPORTANT : N'utilise JAMAIS de JSON Tool Calling ou fonctions natives. 
Utilise UNIQUEMENT ces tags textuels :
[RUN_COMMAND: commande]
[CREATE_FILE: fichier.ext]

RÈGLES D'OR DE COMPORTEMENT :
1. NAVIGATION DOSSIERS : 
   - Si on demande d'OUVRIR/ALLER dans un dossier -> Utilise 'cd "chemin/dossier"'.
   - Si on demande de LISTER/VOIR un dossier -> Utilise 'ls "chemin/dossier"'.
   - NE CONFONDS PAS LES DEUX. Pour naviguer, il faut changer le CWD.

2. OUVERTURE FICHIERS :
   - Pour ouvrir dans l'éditeur -> Utilise 'notepad "nom_fichier"'.
   - Si tu vois "[SUCCESS] Ouverture de..." -> TÂCHE TERMINÉE. ARRÊTE-TOI. NE RELANCE PAS LA COMMANDE.

3. RECHERCHE :
   - Pour trouver un fichier/dossier -> 'Get-ChildItem -Recurse -Filter "nom"'.
   - Si tu le trouves, demande à l'utilisateur s'il veut l'ouvrir (cd) ou l'éditer.

4. CRÉATION (IMPORTANT) :
   - Par défaut -> Utilise [CREATE_FILE: chemin] + bloc de code.
   - SI ET SEULEMENT SI "terminal" ou "commande" est demandé -> Utilise [RUN_COMMAND: New-Item -Path "chemin" -ItemType File].
   
5. DONNÉES MASSIVES :
   - Si tu vois [TRONQUÉ] dans une réponse, cela veut dire que tout n'est pas affiché (limite 10k chars).
   - Utilise 'Select-Object -First 50' ou lis par morceaux si nécessaire.

RÈGLES D'OR GÉNÉRALES :
- RÉPONSE TEXTUELLE UNIQUEMENT.
- CONSCIENCE : Référe toi à [DERNIÈRES_SORTIES_TERMINAL] pour corriger tes erreurs. Si tronqué, affines la recherche.
- POSITION ACTUELLE : ${currentDir}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...cleanedContext,
      { role: 'user', content: message }
    ];

    try {
      const completion = await this.client.chat.completions.create({
        messages,
        model: this.model,
        temperature: 0.1, // Très basse pour éviter les hallucinations de fonctions
        max_tokens: 2048,
        tool_choice: 'none' // Désactiver explicitement les outils
      });

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Erreur Groq (Chat):', error.response?.data || error.message);
      throw new Error(`Groq error: ${error.message}`);
    }
  }
}

export default new GroqService();
