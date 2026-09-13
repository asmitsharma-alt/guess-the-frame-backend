const prisma = require('../config/database');
const logger = require('../utils/logger');

// Built-in catalog fallback matching the game's exact media items
const DEFAULT_FRAMES = [
  { type: "image", content: "GUESSTHEFRAME/Backrooms (2026).webp", answer: "BACKROOMS", year: "2026" },
  { type: "image", content: "GUESSTHEFRAME/Bandar (2026).webp", answer: "BANDAR", year: "2026" },
  { type: "image", content: "GUESSTHEFRAME/Bhavesh Joshi Superhero (2018).webp", answer: "BHAVESH JOSHI SUPERHERO", year: "2018" },
  { type: "image", content: "GUESSTHEFRAME/Booksmart (2019).webp", answer: "BOOKSMART", year: "2019" },
  { type: "image", content: "GUESSTHEFRAME/Days of Thunder (1990).webp", answer: "DAYS OF THUNDER", year: "1990" },
  { type: "image", content: "GUESSTHEFRAME/DC (2026).webp", answer: "DC", year: "2026" },
  { type: "image", content: "GUESSTHEFRAME/Dhoodte reh jaaoge (2009).webp", answer: "DHOONDTE REH JAAOGE", year: "2009" },
  { type: "image", content: "GUESSTHEFRAME/Dil Se.. (1998).webp", answer: "DIL SE", year: "1998" },
  { type: "image", content: "GUESSTHEFRAME/Hostel Daze (2019).webp", answer: "HOSTEL DAZE", year: "2019" },
  { type: "image", content: "GUESSTHEFRAME/Manchester by the Sea (2016).webp", answer: "MANCHESTER BY THE SEA", year: "2016" },
  { type: "image", content: "GUESSTHEFRAME/Margarita with a Straw (2014).webp", answer: "MARGARITA WITH A STRAW", year: "2014" },
  { type: "image", content: "GUESSTHEFRAME/Maruti Mera Dosst (2009).webp", answer: "MARUTI MERA DOSST", year: "2009" },
  { type: "image", content: "GUESSTHEFRAME/Memento (2000).webp", answer: "MEMENTO", year: "2000" },
  { type: "image", content: "GUESSTHEFRAME/Midnight in Paris (2011).webp", answer: "MIDNIGHT IN PARIS", year: "2011" },
  { type: "image", content: "GUESSTHEFRAME/Nobody Knows (2004).webp", answer: "NOBODY KNOWS", year: "2004" },
  { type: "image", content: "GUESSTHEFRAME/Oye Lucky! Lucky Oye! (2008).webp", answer: "OYE LUCKY LUCKY OYE", year: "2008" },
  { type: "image", content: "GUESSTHEFRAME/Queen (2013).webp", answer: "QUEEN", year: "2013" },
  { type: "image", content: "GUESSTHEFRAME/Taarzan The Wonder Car (2004).webp", answer: "TAARZAN THE WONDER CAR", year: "2004" },
  { type: "image", content: "GUESSTHEFRAME/The Handmaiden (2016).webp", answer: "THE HANDMAIDEN", year: "2016" },
  { type: "image", content: "GUESSTHEFRAME/Zodiac (2007).webp", answer: "ZODIAC", year: "2007" }
];

const DEFAULT_EYES = [
  { type: "image", content: "GUESSTHEEYES/Adria Arjona copy.webp", revealContent: "GUESSTHEEYES/Adria Arjona.webp", answer: "ADRIA ARJONA", year: "Actor" },
  { type: "image", content: "GUESSTHEEYES/Anthony Mackie copy.webp", revealContent: "GUESSTHEEYES/Anthony Mackie.webp", answer: "ANTHONY MACKIE", year: "Actor" },
  { type: "image", content: "GUESSTHEEYES/Antony Starr copy.webp", revealContent: "GUESSTHEEYES/Antony Starr.webp", answer: "ANTONY STARR", year: "Actor" },
  { type: "image", content: "GUESSTHEEYES/Emily Blunt copy.webp", revealContent: "GUESSTHEEYES/Emily Blunt.webp", answer: "EMILY BLUNT", year: "Actor" },
  { type: "image", content: "GUESSTHEEYES/Emma Stone copy.webp", revealContent: "GUESSTHEEYES/Emma Stone.webp", answer: "EMMA STONE", year: "Actor" },
  { type: "image", content: "GUESSTHEEYES/Kate Hudson copy.webp", revealContent: "GUESSTHEEYES/Kate Hudson.webp", answer: "KATE HUDSON", year: "Actor" },
  { type: "image", content: "GUESSTHEEYES/Olivia Cooke copy.webp", revealContent: "GUESSTHEEYES/Olivia Cooke.webp", answer: "OLIVIA COOKE", year: "Actor" },
  { type: "image", content: "GUESSTHEEYES/Rachel Brosnahan copy.webp", revealContent: "GUESSTHEEYES/Rachel Brosnahan.webp", answer: "RACHEL BROSNAHAN", year: "Actor" },
  { type: "image", content: "GUESSTHEEYES/Shraddha Kapoor copy.webp", revealContent: "GUESSTHEEYES/Shraddha Kapoor.webp", answer: "SHRADDHA KAPOOR", year: "Actor" },
  { type: "image", content: "GUESSTHEEYES/Zoe Saldana copy.webp", revealContent: "GUESSTHEEYES/Zoe Saldana.webp", answer: "ZOE SALDANA", year: "Actor" }
];

const DEFAULT_DIALOGUES = [
  { type: "dialogue", content: "Aaya hoon, kuch toh loot kar jaunga... Khandani chor hoon main, khandani!", answer: "ANDAAZ APNA APNA", year: "1994" },
  { type: "dialogue", content: "Khoon kharabe wale khandan se aata hoon... roz subah uthkar 2-4 khoon na karoon toh mera naashta hazam nahi hota!", answer: "HUNGAMA", year: "2003" },
  { type: "dialogue", content: "Yeh koi tareeka hai bheek maangne ka?!", answer: "GOLMAAL", year: "2006" },
  { type: "dialogue", content: "Meri ek taang nakli hai, main hockey ka bohot bada khiladi tha...", answer: "WELCOME", year: "2007" },
  { type: "dialogue", content: "Arey ₹5 mein chicken biryani de raha hai re woh!", answer: "RUN", year: "2004" },
  { type: "dialogue", content: "Hi, guys. We're going on a national bikini tour, and we're looking for two oil boys who can grease us up before each competition.", answer: "DUMB AND DUMBER", year: "1994" },
  { type: "dialogue", content: "It’s not a purse, it’s a satchel. Gods and Indiana Jones wears one.", answer: "THE HANGOVER", year: "2009" },
  { type: "dialogue", content: "I'm not Bad. I'm just Drawn That Way.", answer: "WHO FRAMED ROGER RABBIT", year: "1988" },
  { type: "dialogue", content: "I don't want to survive. I want to live.", answer: "WALL-E", year: "2008" },
  { type: "dialogue", content: "I wasted so much time worrying what could go wrong, but what did go wrong, was never the things I worried about.", answer: "THE WORST PERSON IN THE WORLD", year: "2021" }
];

const DEFAULT_TIE_BREAKERS = [
  { type: "image", content: "tie breaker/Anatomy of a Fall (2023).webp", answer: "ANATOMY OF A FALL", year: "2023" },
  { type: "image", content: "tie breaker/Eyes Wide Shut (1999).webp", answer: "EYES WIDE SHUT", year: "1999" },
  { type: "image", content: "tie breaker/Ghilli (2004).webp", answer: "GHILLI", year: "2004" },
  { type: "image", content: "tie breaker/La Haine(1995).webp", answer: "LA HAINE", year: "1995" },
  { type: "image", content: "tie breaker/Mad Max 2.jpg.webp", answer: "MAD MAX 2", year: "1981" },
  { type: "image", content: "tie breaker/Moonrise Kingdom (2012).webp", answer: "MOONRISE KINGDOM", year: "2012" },
  { type: "image", content: "tie breaker/The Batman (2022).webp", answer: "THE BATMAN", year: "2022" },
  { type: "image", content: "tie breaker/The Holdovers(2023).webp", answer: "THE HOLDOVERS", year: "2023" },
  { type: "image", content: "tie breaker/The Life of Chuck(2024).webp", answer: "THE LIFE OF CHUCK", year: "2024" },
  { type: "image", content: "tie breaker/The Lighthouse (2019).webp", answer: "THE LIGHTHOUSE", year: "2019" },
  { type: "image", content: "tie breaker/The Wolf of Wall Street (2013).webp", answer: "THE WOLF OF WALL STREET", year: "2013" },
  { type: "image", content: "tie breaker/They Call Him OG (2025).webp", answer: "THEY CALL HIM OG", year: "2025" },
  { type: "image", content: "tie breaker/Top Gun Maverick (2022).webp", answer: "TOP GUN MAVERICK", year: "2022" },
  { type: "image", content: "tie breaker/Under the Silver Lake (2018).webp", answer: "UNDER THE SILVER LAKE", year: "2018" }
];

class CatalogService {
  async getCatalogByCategory(category) {
    try {
      if (prisma && prisma.catalogItem) {
        const items = await prisma.catalogItem.findMany({
          where: { category }
        });
        if (items && items.length > 0) return items;
      }
    } catch (err) {
      logger.warn('Prisma query failed, using built-in catalog fallback:', err.message);
    }

    switch (category) {
      case 'frames':
        return DEFAULT_FRAMES;
      case 'eyes':
        return DEFAULT_EYES;
      case 'dialogue':
        return DEFAULT_DIALOGUES;
      case 'tie_breaker':
        return DEFAULT_TIE_BREAKERS;
      default:
        return DEFAULT_FRAMES;
    }
  }

  async getAllCatalog() {
    return {
      frames: await this.getCatalogByCategory('frames'),
      eyes: await this.getCatalogByCategory('eyes'),
      dialogue: await this.getCatalogByCategory('dialogue'),
      tieBreaker: await this.getCatalogByCategory('tie_breaker')
    };
  }

  async generatePlaylist(settings = {}) {
    const categories = settings.categories || [settings.category || 'frames'];
    const totalRounds = Math.min(Math.max(settings.rounds || 10, 1), 50);

    let pool = [];
    for (const cat of categories) {
      const items = await this.getCatalogByCategory(cat);
      const taggedItems = items.map((it, idx) => ({
        ...it,
        id: it.id || `${cat}_${idx}`,
        category: cat,
        sectionName: cat === 'frames' ? 'Guess the Frame' : (cat === 'eyes' ? 'Guess the Eyes' : 'Guess the Dialogue')
      }));
      pool.push(...taggedItems);
    }

    if (pool.length === 0) {
      pool = DEFAULT_FRAMES.map((it, idx) => ({ ...it, id: `frames_${idx}`, category: 'frames', sectionName: 'Guess the Frame' }));
    }

    // Shuffle pool with Fisher-Yates algorithm
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, totalRounds);
  }

  async getRandomTieBreaker(usedKeys = []) {
    const items = await this.getCatalogByCategory('tie_breaker');
    const available = items.filter(it => !usedKeys.includes(it.answer));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
    return items[Math.floor(Math.random() * items.length)];
  }
}

module.exports = new CatalogService();
module.exports.DEFAULT_FRAMES = DEFAULT_FRAMES;
module.exports.DEFAULT_EYES = DEFAULT_EYES;
module.exports.DEFAULT_DIALOGUES = DEFAULT_DIALOGUES;
module.exports.DEFAULT_TIE_BREAKERS = DEFAULT_TIE_BREAKERS;
