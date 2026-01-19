import express from 'express';
import ollamaService from '../services/ollama.js';
import geminiService from '../services/gemini.js';
import groqService from '../services/groq.js';

const router = express.Router();

// Route pour obtenir la complétion de code
router.post('/complete', async (req, res) => {
  try {
    const { code, language, provider = 'ollama', prompt } = req.body;

    if (!code && !prompt) {
      return res.status(400).json({ 
        error: 'Le code ou le prompt est requis' 
      });
    }

    let completion;

    switch (provider) {
      case 'ollama':
        completion = await ollamaService.complete(code, language, prompt);
        break;
      case 'gemini':
        completion = await geminiService.complete(code, language, prompt);
        break;
      case 'groq':
        completion = await groqService.complete(code, language, prompt);
        break;
      default:
        return res.status(400).json({ 
          error: 'Provider non supporté' 
        });
    }

    res.json({ completion, provider });
  } catch (error) {
    console.error('Erreur lors de la complétion:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la génération', 
      message: error.message 
    });
  }
});

// Route pour le chat avec l'IA
router.post('/chat', async (req, res) => {
  try {
    const { message, context, provider = 'ollama' } = req.body;

    if (!message) {
      return res.status(400).json({ 
        error: 'Le message est requis' 
      });
    }

    let response;

    switch (provider) {
      case 'ollama':
        response = await ollamaService.chat(message, context);
        break;
      case 'gemini':
        response = await geminiService.chat(message, context);
        break;
      case 'groq':
        response = await groqService.chat(message, context);
        break;
      default:
        return res.status(400).json({ 
          error: 'Provider non supporté' 
        });
    }

    res.json({ response, provider });
  } catch (error) {
    console.error('Erreur lors du chat:', error);
    res.status(500).json({ 
      error: 'Erreur lors du chat', 
      message: error.message 
    });
  }
});

// Route pour vérifier la disponibilité des services
router.get('/status', async (req, res) => {
  const status = {
    ollama: await ollamaService.isAvailable(),
    gemini: await geminiService.isAvailable(),
    groq: await groqService.isAvailable()
  };
  
  res.json(status);
});

export default router;
