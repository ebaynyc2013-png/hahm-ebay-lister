// Named style aesthetics, each with the things you can actually SEE that
// identify it.
//
// Buyers browse by aesthetic — "bohemian blue dress", "office siren blazer" —
// and a listing that never says the word is invisible to them. The seller
// follows Vendoo's cores-and-aesthetics guide for this, and what matters here
// is not the name on its own but the cues beside it: a model that is told
// Cottagecore means florals, puff sleeves, gingham and lace can recognise one
// in a photograph, where a bare list of 70 fashionable words would only invite
// guessing.
//
// The cues are compressed from that guide. Names it listed without saying what
// they look like are kept separately below, because a name with no cues is
// nothing to recognise.

export interface Aesthetic {
  name: string;
  /** What a photograph has to show for this to be the honest answer. */
  cues: string;
}

export const AESTHETICS: Aesthetic[] = [
  { name: "Academia", cues: "plaid skirts, trench coats, cable knits, loafers, pleated trousers, tweed blazers, light neutrals" },
  { name: "Dark Academia", cues: "tweed, wool coats, pleated skirts, oxford shirts, leather satchels; brown, charcoal, olive, burgundy" },
  { name: "Athleisure", cues: "leggings, biker shorts, matching sets, performance jackets, trainers worn as everyday wear" },
  { name: "Balletcore", cues: "wrap tops, ballet flats, soft pink and ivory, satin, lace, ribbons, tulle, fitted knitwear" },
  { name: "Barbiecore", cues: "hot pink, coordinated sets, statement accessories, bright playful prints" },
  { name: "Bikercore", cues: "leather jackets, moto boots, riding gloves, distressed denim, studs, chains, bandanas" },
  { name: "Blokecore", cues: "vintage football jerseys, track jackets, straight-leg jeans, trainers, rugby shirts, windbreakers" },
  { name: "Blokette", cues: "football jerseys and track pieces softened with bows, lace and dainty details" },
  { name: "Bohemian", cues: "embroidery, maxi dresses, fringe, crochet, suede, earthy colours, mixed prints" },
  { name: "Boho Chic", cues: "pared-back bohemian: neutral colours, linen, crochet, light knits, relaxed layering" },
  { name: "Cabincore", cues: "buffalo plaid, chunky sweaters, flannel, hiking boots, wool coats, quilted outerwear" },
  { name: "Cherry Girl", cues: "cherry motifs, bold reds and pinks, graphic knitwear, baby tees, cardigans, mini skirts" },
  { name: "Classiccore", cues: "oxford shirts, straight-leg denim, loafers, knit sweaters, trench coats, polos" },
  { name: "Coconut Girl", cues: "hibiscus prints, crochet and halter tops, shell jewellery, bucket hats; bright pink, orange, turquoise, lime" },
  { name: "Cosplay", cues: "character pieces, anime and superhero apparel, capes, wigs, fantasy accessories, school-uniform styling" },
  { name: "Corpcore", cues: "blazers, tailored trousers, pencil skirts, button-downs, structured handbags, neutral palette" },
  { name: "Corporate Siren", cues: "Corpcore sharpened: fitted pencil skirts, tailored blazers, pointed heels" },
  { name: "Cottagecore", cues: "florals, puff sleeves, gingham, lace, embroidery, flowing dresses" },
  { name: "Coquette", cues: "bows, ribbons, lace, corsets, satin, pearls, camisoles, pastels, floral prints" },
  { name: "Dark Coquette", cues: "coquette in richer colours: velvet, black lace, gothic touches" },
  { name: "Cozycore", cues: "sherpa pullovers, oversized sweatshirts, knits, fleece, lounge sets, slippers, soft neutrals" },
  { name: "Cute Goth", cues: "black with pink and purple, plaid skirts, platforms, fishnets, bows, kawaii accessories" },
  { name: "Fairycore", cues: "flowing dresses, sheer fabrics, ribbons, butterflies, puff sleeves" },
  { name: "Castlecore", cues: "medieval and Renaissance shapes, flowing dresses, sheer fabrics, lacing, puff sleeves" },
  { name: "Festival", cues: "crochet, fringe, sequins, metallics, fishnets, cowboy boots, oversized sunglasses" },
  { name: "Cybercore", cues: "chrome, holographic fabrics, metallics, reflective materials, geometric cuts" },
  { name: "Gorpcore", cues: "fleece, puffers, cargo trousers, hiking boots, technical shells, utility vests, earthy colours" },
  { name: "Goth", cues: "black, lace, velvet, leather, corsets, platform boots, chains, crosses, studs" },
  { name: "Mall Goth", cues: "Y2K goth: chains, band tees, wide Tripp-style trousers, fishnets, platforms" },
  { name: "Gothic Lolita", cues: "lace, corsets, full skirts, bows, Victorian shapes" },
  { name: "Witchcore", cues: "flowing black dresses, celestial motifs, crystals, natural earthy textures" },
  { name: "Whimsigoth", cues: "jewel tones, moons and stars, velvet, layered flowing shapes" },
  { name: "Grandmacore", cues: "oversized knits, crochet, florals, quilted jackets, long skirts, cardigans, aprons" },
  { name: "Grandpacore", cues: "cardigans, sweater vests, tweed blazers, pleated trousers, loafers, corduroy, argyle, suspenders" },
  { name: "Heritage", cues: "waxed jackets, chore coats, heavy flannel, wool sweaters, corduroy, field jackets" },
  { name: "Indie Vanguard", cues: "band tees, faux fur, trench coats, distressed denim, combat boots, leather jackets" },
  { name: "Kawaii", cues: "pastels, bows, ruffles, cartoon graphics, pleated skirts, platforms, plush accessories" },
  { name: "Kidcore", cues: "primary and rainbow colours, overalls, striped shirts, glitter, smiley faces" },
  { name: "Maximalist", cues: "vibrant prints, mixed patterns, oversized jewellery, sequins, feathers" },
  { name: "Mermaidcore", cues: "iridescent fabrics, sequins, pearls, shells; seafoam, aqua, lavender; slip dresses" },
  { name: "Minimalist", cues: "monochrome, tailored trousers, structured blazers, crisp button-downs, neutral palette" },
  { name: "Mob Wife", cues: "faux fur, animal print, leather, bodycon dresses, bold jewellery, stiletto boots" },
  { name: "Normcore", cues: "straight-leg jeans, plain tees, crewnecks, fleece, trainers, baseball caps, chinos" },
  { name: "Office Siren", cues: "pencil skirts, tailored blazers, slim cardigans, pointed heels, pinstripes; black, grey, chocolate, burgundy" },
  { name: "Old Money", cues: "cashmere, polos, pleated trousers, loafers, tennis skirts, silk scarves, pearls" },
  { name: "Preppy", cues: "polos, oxford button-downs, cable knits, pleated skirts, chinos, boat shoes, plaid; navy, white, khaki, green, burgundy" },
  { name: "Punkcore", cues: "leather, moto jackets, tartan, distressed denim, fishnets, combat boots, safety pins, studs, patches, ripped tees, mostly black" },
  { name: "Quiet Luxury", cues: "linen, cashmere, silk, fine wool, trench coats, loafers, neutral palette, no visible logos" },
  { name: "Rainbowcore", cues: "rainbow stripes, pride apparel, graphic tees, colourful knits, sequins" },
  { name: "Retro Glam", cues: "tweed skirt suits, pearls, bows, houndstooth, pumps, silk scarves" },
  { name: "Rocker", cues: "band tees, leather jackets, distressed denim, skulls, studs, combat boots" },
  { name: "Glam Rock", cues: "metallics, embellishments, platform boots" },
  { name: "Punk Rock", cues: "leather, tartan, studs, visibly DIY styling" },
  { name: "Rockabilly", cues: "1950s pin-up silhouettes, cuffed denim, vintage dresses" },
  { name: "Goth Rock", cues: "black, lace, leather, dramatic accessories" },
  { name: "Skater", cues: "oversized graphic tees, hoodies, baggy jeans, cargo and carpenter trousers, skate shoes, beanies, flannels" },
  { name: "Slow Fashion", cues: "natural fibres, classic silhouettes, visible craftsmanship and durability" },
  { name: "Southwestern", cues: "earth tones, turquoise, concho belts, embroidered denim, suede, geometric prints" },
  { name: "Sportswear", cues: "jerseys, hoodies, track jackets, windbreakers, quarter-zips, team merchandise" },
  { name: "Steampunk", cues: "corsets, waistcoats, lace-up boots, brass hardware, goggles, pocket watches, gears" },
  { name: "Streetwear", cues: "oversized hoodies, varsity jackets, graphic tees, trainers, cargo trousers, joggers, caps" },
  { name: "Techwear", cues: "waterproof shells, cargo trousers, utility vests, reflective details, modular pockets; black, charcoal, olive, grey" },
  { name: "Tomato Girl", cues: "linen dresses, crochet tops, puff sleeves, headscarves, woven bags, sandals, stripes, warm neutrals with tomato red" },
  { name: "Twee", cues: "Peter Pan collars, polka dots, colourful cardigans, patterned tights, Mary Janes, cat-eye glasses" },
  { name: "Western", cues: "cowboy boots, denim shirts, pearl snaps, fringe, suede, bolo ties, concho belts, cowboy hats, turquoise" },
  { name: "Y2K Vintage", cues: "genuine late-90s and early-2000s pieces: baby tees, velour tracksuits, baguette bags, rhinestones, butterflies, low-rise jeans, trucker hats" },
  { name: "Y2K Style", cues: "the look without the age: baby tees, pleated mini skirts, micro shorts, halter tops, lace camisoles, chunky trainers" },
];

/**
 * Named in the guide with no description of how they look. Kept apart on
 * purpose: a name with no cues is nothing to recognise, and offering one would
 * be inviting a guess. They are here so the word is not treated as unknown if
 * the seller writes it on her note herself.
 */
export const AESTHETICS_WITHOUT_CUES = [
  "Clean Girl",
  "Coastal Cowgirl",
  "Fishermancore",
  "Scandinavian Minimalism",
  "Cyberpunk",
  "Y3K",
  "Harajuku",
  "Grunge",
  "Emo",
  "Scene",
  "Campcore",
];

/**
 * Words that must never reach a TITLE, though they are fine as item specifics.
 *
 * Barbie is a trademark: a listing that uses it on something not actually
 * Barbie-branded gets taken down. Gypsy is a slur, and listings carrying it
 * are removed — eBay nonetheless offers it as a dress Style value, which is
 * exactly why this list is separate from eBay's own vocabulary rather than
 * derived from it.
 */
export const NOT_IN_TITLE = ["Barbie", "Gypsy"];

export function isAllowedInTitle(word: string): boolean {
  const w = word.trim().toLowerCase();
  return !NOT_IN_TITLE.some((banned) => w === banned.toLowerCase());
}

/** Strip any banned word from a finished title, leaving spacing tidy. */
export function stripBannedTitleWords(title: string): string {
  let out = title;
  for (const banned of NOT_IN_TITLE)
    out = out.replace(new RegExp(`\\b${banned}\\b`, "gi"), " ");
  return out.replace(/\s{2,}/g, " ").trim();
}

/** The catalogue as prompt lines: one aesthetic per line, name then cues. */
export function aestheticsPromptBlock(): string {
  return AESTHETICS.map((a) => `- ${a.name}: ${a.cues}`).join("\n");
}
