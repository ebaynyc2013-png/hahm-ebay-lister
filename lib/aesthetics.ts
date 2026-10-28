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
  /** Other names buyers search under ("Light Academia" for Academia). */
  aliases?: string[];
  /** What a photograph has to show for this to be the honest answer. */
  cues: string;
}

export const AESTHETICS: Aesthetic[] = [
  { name: "Academia", aliases: ["Light Academia"], cues: "plaid skirts, trench coats, cable knits, loafers, pleated trousers, tweed blazers, light neutrals; gold-tone accessories" },
  { name: "Dark Academia", cues: "tweed, wool coats, pleated skirts, oxford shirts, leather satchels; brown, charcoal, olive, burgundy" },
  { name: "Athleisure", cues: "leggings, biker shorts, matching sets, performance jackets, athletic dresses, trainers worn as everyday wear" },
  { name: "Balletcore", cues: "wrap tops, ballet flats, soft pink and ivory, satin, lace, ribbons, tulle, fitted knitwear" },
  { name: "Barbiecore", cues: "hot pink, coordinated sets, statement accessories, bright playful prints" },
  { name: "Bikercore", cues: "leather jackets, moto boots, riding gloves, distressed denim, studs, chains, bandanas" },
  { name: "Blokecore", cues: "vintage football jerseys, track jackets, straight-leg jeans, trainers, rugby shirts, windbreakers; 1980s–90s football culture" },
  { name: "Blokette", cues: "football jerseys and track pieces softened with bows, lace and dainty details" },
  { name: "Bohemian", cues: "embroidery, maxi dresses, fringe, lace, crochet, suede, earthy colours, mixed prints; layered jewellery, cord and leather necklaces, natural materials; home: rattan, bamboo, saturated eclectic colours, layered textiles" },
  { name: "Boho Chic", cues: "pared-back bohemian: neutral and earthy colours, linen, crochet, light knits, floral prints, relaxed layering; woven accessories" },
  { name: "Cabincore", cues: "buffalo plaid, chunky sweaters, flannel, hiking boots, moccasins, beanies, wool coats, quilted outerwear" },
  { name: "Cherry Girl", cues: "cherry motifs (also strawberry and citrus), heart details, bold reds and pinks, graphic knitwear, baby tees, cardigans, mini skirts" },
  { name: "Classiccore", cues: "oxford shirts, straight-leg denim, loafers, knit sweaters, trench coats, polos" },
  { name: "Coconut Girl", cues: "hibiscus and tropical prints, crochet and halter tops, mini skirts, shell jewellery, bucket hats, colourful swimwear; bright pink, orange, turquoise, lime" },
  { name: "Cosplay", cues: "character pieces, anime and superhero apparel, capes, wigs, fantasy accessories, school-uniform styling" },
  { name: "Corpcore", cues: "blazers, tailored trousers, pencil skirts, button-downs, structured handbags, neutral palette; business casual, wear to work" },
  { name: "Corporate Siren", cues: "Corpcore sharpened: fitted pencil skirts, tailored blazers, pointed heels" },
  { name: "Cottagecore", cues: "florals, puff sleeves, gingham, lace, embroidery, flowing dresses; home: vintage decor, soft colours, botanical patterns" },
  { name: "Coquette", cues: "bows, ribbons, lace, corsets, satin, pearls and pearl jewellery, camisoles, stockings, soft pinks, ivory, floral prints" },
  { name: "Dark Coquette", cues: "coquette in richer colours: velvet, black lace, gothic touches" },
  { name: "Cowgirl", cues: "western with feminine styling: cowboy boots, denim, fringe, suede, turquoise jewellery, western belts, snap shirts, embroidery" },
  { name: "Cozycore", cues: "sherpa pullovers, oversized sweatshirts, knits, fleece, lounge sets, slippers, soft neutrals" },
  { name: "Cute Goth", aliases: ["Pastel Goth", "Soft Goth"], cues: "black with pink and purple, plaid skirts, platforms, fishnets, crosses, skulls, bows, chains, kawaii accessories" },
  { name: "Fairycore", cues: "flowing dresses, sheer fabrics, ribbons, butterflies, puff sleeves, delicate accessories" },
  { name: "Castlecore", cues: "medieval and Renaissance shapes, flowing dresses, corsets, sheer fabrics, lacing, puff sleeves" },
  { name: "Festival", cues: "crochet, fringe, sequins, metallics, fishnets, cowboy boots, oversized sunglasses, statement accessories" },
  { name: "Cybercore", aliases: ["Futuristic"], cues: "chrome, holographic fabrics, metallics, reflective materials, geometric cuts, iridescent accessories" },
  { name: "Gorpcore", aliases: ["Granola Girl"], cues: "fleece, puffers, cargo trousers, hiking boots, technical shells, utility vests, backpacks, earthy colours" },
  { name: "Goth", cues: "black, lace, velvet, leather, corsets, platform boots, chains, crosses, studs; Victorian and punk influence" },
  { name: "Mall Goth", cues: "Y2K goth: chains, band tees, wide Tripp-style trousers, fishnets, platforms" },
  { name: "Gothic Lolita", cues: "lace, corsets, full skirts, bows, Victorian shapes" },
  { name: "Witchcore", cues: "flowing black dresses, celestial motifs, herbs, crystals, natural earthy textures" },
  { name: "Whimsigoth", aliases: ["Whimsy Goth"], cues: "celestial and bohemian: jewel tones, moons and stars, velvet, layered flowing shapes" },
  { name: "Grandmacore", cues: "chunky and oversized knits, crochet, florals, quilted jackets, long skirts, cardigans, aprons, vintage accessories; home: crochet, doilies, floral and botanical patterns, soft colours" },
  { name: "Grandpacore", aliases: ["Eclectic Grandpa"], cues: "cardigans, sweater vests, tweed blazers, pleated trousers, loafers with white socks, corduroy, argyle, suspenders" },
  { name: "Heritage", cues: "waxed jackets, chore coats, heavy flannel, wool sweaters, leather boots, corduroy, field jackets" },
  { name: "Indie Vanguard", aliases: ["Indie Sleaze"], cues: "band tees, faux fur, trench coats, distressed denim, combat boots, leather jackets, layered accessories, thrifted statement pieces" },
  { name: "Kawaii", cues: "pastels, bows, ruffles, cartoon graphics, pleated skirts, platforms, plush accessories" },
  { name: "Kidcore", cues: "primary and rainbow colours, overalls, striped shirts, glitter, butterflies, smiley faces, colourful sneakers" },
  { name: "Lagenlook", cues: "layered look: several loose, relaxed layers worn together (tunics over skirts or trousers), boho-chic and New Romantic influence" },
  { name: "Maximalist", aliases: ["Dopamine"], cues: "vibrant prints, mixed and clashing patterns, oversized jewellery, sequins, feathers, embellished pieces; home: saturated colours, layered textures, fringed trims, oversized art and statement vases" },
  { name: "Mermaidcore", cues: "iridescent fabrics, sequins, pearls, shells; seafoam, aqua, lavender; slip dresses" },
  { name: "Minimalist", cues: "monochrome, tailored trousers, structured blazers, crisp button-downs, neutral palette, understated accessories, thin simple jewellery; home: clean lines, simple shapes, neutral and white palette, marble" },
  { name: "Mob Wife", cues: "faux fur, animal print, leather, bodycon dresses, bold and chunky gold-tone jewellery, statement handbags, stiletto boots" },
  { name: "Nautical", cues: "Breton and bold stripes, navy and white, polka dots, striped tops and blazers, white jeans, anchor motifs, anchor-chain and rope details, ocean-inspired jewellery" },
  { name: "Normcore", cues: "straight-leg jeans, plain tees, crewnecks, hoodies, fleece, trainers, baseball caps, chinos" },
  { name: "Office Siren", cues: "late-90s and early-2000s corporate: pencil skirts, tailored blazers, slim cardigans, pointed heels, pinstripes, rectangular glasses, leather handbags; black, grey, chocolate, burgundy" },
  { name: "Old Money", cues: "cashmere, polos, pleated trousers, loafers, tennis skirts, silk scarves, pearl jewellery, structured handbags; classic engraved silver and silver-tone cases (cigarette, card) and similar heirloom accessories" },
  { name: "Phoebe Buffay Style", aliases: ["Phoebe Buffay"], cues: "90s revival: maxi skirts, crochet, fringe, embroidered vests, velvet, patchwork, chunky jewellery, long necklaces and pendants" },
  { name: "Prairiecore", cues: "modest body-covering dresses, frills and ruffles, laced-up bib fronts, sheer gingham, florals, creamy lace; charm necklaces and trinkets" },
  { name: "Preppy", cues: "polos, oxford button-downs, cable knits, pleated skirts, chinos, boat shoes, pearls, plaid; navy, white, khaki, green, burgundy" },
  { name: "Punkcore", cues: "leather, moto jackets, tartan, distressed denim, fishnets, combat boots, safety pins, studs, spikes, chains, patches, ripped tees, mostly black" },
  { name: "Quiet Luxury", aliases: ["Minimalist Renaissance"], cues: "linen, cashmere, silk, fine wool, trench coats, loafers, neutral palette, no visible logos" },
  { name: "Rainbowcore", cues: "ONLY when the item reflects pride: rainbow stripes, pride apparel, graphic tees, colourful accessories, sequins" },
  { name: "Ranch", aliases: ["Ranchcore"], cues: "refined western: denim blues and indigo, cognac-to-espresso leather, prairie florals, Americana plaids and checks, hammered hardware, aged brass" },
  { name: "Retro Glam", cues: "Old Hollywood polish: tweed skirt suits, pearls, bows, houndstooth, pumps, silk scarves, structured handbags; vintage compacts and cigarette cases" },
  { name: "Rocker", cues: "band tees, leather jackets, distressed denim, skulls, roses, studs, chains, combat boots, vintage concert merch" },
  { name: "Glam Rock", cues: "metallics, embellishments, platform boots" },
  { name: "Punk Rock", cues: "leather, tartan, studs, visibly DIY styling" },
  { name: "Rockabilly", cues: "1950s pin-up silhouettes, cuffed denim, vintage dresses" },
  { name: "Goth Rock", cues: "black, lace, leather, dramatic accessories" },
  { name: "Skater", cues: "oversized graphic tees, hoodies, baggy jeans, cargo and carpenter trousers, skate shoes, beanies, snapbacks, flannels" },
  { name: "Slow Fashion", cues: "natural fibres, classic silhouettes, visible craftsmanship and durability" },
  { name: "Southwestern", cues: "earth tones, turquoise accents, concho belts, embroidered denim, suede, fringe, geometric prints, cowboy boots" },
  { name: "Sportswear", cues: "jerseys, hoodies, track jackets, windbreakers, quarter-zips, team and collegiate merchandise" },
  { name: "Steampunk", cues: "corsets, waistcoats, lace-up boots, brass hardware, goggles, pocket watches, gears" },
  { name: "Streetwear", cues: "oversized hoodies, varsity jackets, graphic tees, trainers, cargo trousers, joggers, caps" },
  { name: "Techwear", cues: "waterproof shells, cargo trousers, utility vests and belts, harnesses, reflective details, modular pockets; black, charcoal, olive, grey" },
  { name: "Tomato Girl", cues: "linen dresses, crochet tops, puff sleeves, headscarves, woven bags, sandals, stripes, warm neutrals with tomato red, lemon and tomato motifs" },
  { name: "Twee", cues: "Peter Pan collars, polka dots, bows, colourful cardigans, patterned tights, Mary Janes, cat-eye glasses" },
  { name: "Western", cues: "cowboy boots, denim shirts, pearl snaps, fringe, suede, bolo ties, concho belts, cowboy hats, turquoise jewellery, bootcut denim" },
  { name: "Y2K Vintage", cues: "genuine late-90s and early-2000s pieces: baby tees, velour tracksuits, baguette bags, rhinestones, butterflies, LOW-RISE jeans, cargo pants, halter tops, mesh, trucker hats. Never for high-rise or high-waisted pieces" },
  { name: "Y2K Style", aliases: ["Y2K"], cues: "the look without the age: baby tees, pleated mini skirts, micro shorts, halter tops, lace camisoles, rhinestones, LOW-RISE denim, chunky trainers, colourful sunglasses. Never for high-rise or high-waisted pieces" },
  // Named in the guide without cues; researched separately and now recognisable.
  { name: "Clean Girl", cues: "very few colours, polished but unfussy; white, black, grey, light neutrals; slicked centre-parted bun, glossy skin, gold hoops" },
  { name: "Coastal Cowgirl", cues: "western meets beach: cowboy boots and hats, denim and chambray shirts, denim shorts, floaty sundresses, florals, flannel, linen; earth tones, denim blue, bright accents; horses and shells" },
  { name: "Fishermancore", cues: "cream Aran and chunky knits, Breton boat-neck stripes, yellow raincoats, tactical vests with big pockets, waterproof boots, deck shoes, sailor caps, bucket hats; sardine and tinned-fish motifs" },
  { name: "Scandinavian Minimalism", cues: "oversized menswear-cut suits, leather trousers, straight jeans, plain tees and white shirts, cashmere knits, flowing midi skirts, blazers; linen, wool, cashmere, suede; monochrome with one bold accessory; baggy silhouette, flat shoes" },
  { name: "Cyberpunk", cues: "futuristic gothic: trench coats, boots, shiny black surfaces" },
  { name: "Harajuku", cues: "Japanese street maximalism: graphic tops, wide trousers, mesh layered over basics, faux fur, puffer or leather statement jackets, accessories piled on; any palette from pastel to neon to black, patterns mixed (substyles: Decora, Fairy Kei, Gyaru, Visual Kei)" },
  { name: "Grunge", cues: "loose androgynous silhouette, worn denim, plaid flannel, distressed raw edges, knit beanie, heavy combat boots" },
  { name: "Emo", cues: "black with bright accents, band tees, skinny low-rise jeans, oversized hoodies, striped arm warmers and tights, Converse or Vans, studded and checked belts, rubber bracelets" },
  { name: "Scene", cues: "black with neon, bright printed skinny jeans, band tees, white and studded belts, tutus, arm warmers, fingerless gloves, high-top Converse; stripes, plaid, checkerboard, skulls, hearts, cartoon characters" },
  // Home and decor styles — for vases, mirrors, cases, frames, tableware and
  // other things for the home, which the fashion guide does not cover.
  { name: "Mid-Century Modern", cues: "home and objects: clean lines, tapered legs, curved corners, warm wood, plain functional forms with little ornament, graphic prints" },
  { name: "Art Deco", cues: "geometric shapes, symmetry, pointed edges, metallics, metal and glass, silver pieces, rich glamorous colours; jewellery and objects with stepped or fan geometry" },
  { name: "Hollywood Regency", cues: "home: glamorous, bold contrasting colours, flamboyant patterns, gilt and mirrored pieces; art deco meets mid-century" },
  { name: "Farmhouse", cues: "home: white-painted wood, slubby linen, handmade ceramic jugs, vases and bowls, warm wood, sage green and neutrals, mixed metals" },
  { name: "Shabby Chic", cues: "home: painted or distressed vintage pieces, soft feminine tones, florals, rustic and cosy" },
  { name: "Coastal", cues: "home: neutrals with blue, light fabrics, driftwood and wood accents, sea-inspired motifs (shells, waves)" },
  { name: "Rustic", cues: "home: rugged finishes, reclaimed wood, exposed brick, earthy ochre, rust, cream and stone tones" },
  { name: "Industrial", cues: "home: metalwork, concrete, exposed brick, Edison bulbs, mixed metal and wood, cool grey and taupe" },
];

/**
 * Named in the guide with no description of how they look. Kept apart on
 * purpose: a name with no cues is nothing to recognise, and offering one would
 * be inviting a guess. They are here so the word is not treated as unknown if
 * the seller writes it on her note herself.
 */
export const AESTHETICS_WITHOUT_CUES = [
  // Campcore alone is left here. Nine of the guide's undescribed names were
  // researched and moved up into the catalogue above; for this one no source
  // describing it could be found, and a name with no cues is nothing to
  // recognise.
  //
  // Y3K was dropped rather than researched: the seller judges it a slip for
  // Y2K, which the catalogue already covers twice — once for genuine
  // period pieces and once for the look without the age.
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
  return AESTHETICS.map(
    (a) =>
      `- ${a.name}${a.aliases?.length ? ` (also: ${a.aliases.join(", ")})` : ""}: ${a.cues}`,
  ).join("\n");
}

/** "Mob Wife" → "mobwife": the form a hashtag takes. */
export const hashtagForm = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const AESTHETIC_FORMS = new Set(
  AESTHETICS.flatMap((a) => [a.name, ...(a.aliases ?? [])]).map(hashtagForm),
);

/**
 * Is this hashtag an aesthetic from the catalogue? "#mobwife", "#bohochic",
 * also "#mobwifeaesthetic" or "#y2kstyle" — a name, or a name with one of the
 * words people add to them.
 */
export function isAestheticHashtag(tag: string): boolean {
  const t = hashtagForm(tag);
  if (AESTHETIC_FORMS.has(t)) return true;
  const m = t.match(/^(.+?)(?:aesthetic|style|vibes?|core|look|fashion)$/);
  return !!m && AESTHETIC_FORMS.has(m[1]);
}
