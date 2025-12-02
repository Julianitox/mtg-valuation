# Explication Détaillée : Structure des Boosters MTGJSON et Calculs d'EV

## 📚 Référence
Documentation MTGJSON : https://mtgjson.com/data-models/booster/

---

## 1. Structure Globale d'un Booster MTGJSON

Selon la [documentation MTGJSON](https://mtgjson.com/data-models/booster/), un booster est une structure de données contenant des configurations de booster. Chaque set peut avoir plusieurs types de boosters (draft, set, collector, etc.).

### Structure dans le JSON

```json
{
  "data": {
    "booster": {
      "draft": {
        "sheets": { ... },           // Feuilles de cartes avec probabilités
        "boosters": [ ... ],         // Layouts possibles
        "boostersTotalWeight": 444   // Poids total pour normalisation
      },
      "set": { ... },
      "collector": { ... }
    }
  }
}
```

**Exemple réel (Zendikar Rising)** :
- Types disponibles : `['arena', 'collector', 'draft', 'prerelease', 'set', 'theme-b', ...]`
- Chaque type a sa propre structure de sheets et layouts

---

## 2. Les Sheets (Feuilles de Cartes)

### Définition

Une **sheet** est une collection de cartes avec leurs poids relatifs. Chaque carte a un poids qui détermine sa probabilité d'apparaître dans cette sheet.

### Structure d'une Sheet

```json
{
  "commonWithShowcase": {
    "cards": {
      "uuid-carte-1": 3,    // Poids de la carte 1
      "uuid-carte-2": 3,    // Poids de la carte 2
      ...
    },
    "totalWeight": 303,     // Somme de tous les poids
    "foil": false,          // Si la sheet contient des foils
    "balanceColors": true   // Si les couleurs doivent être équilibrées
  }
}
```

### Exemple Concret (ZNR - commonWithShowcase)

- **Nombre de cartes** : 110 cartes différentes
- **Total weight** : 303
- **Foil** : false
- **Poids par carte** : Généralement 3 (mais peut varier)

**Signification** : Si une carte a un poids de 3 sur un total de 303, sa probabilité d'apparaître dans cette sheet est de `3/303 ≈ 0.99%`.

---

## 3. Les Boosters (Layouts)

### Définition

Un **layout** (ou booster) définit une combinaison spécifique de sheets. Un type de booster peut avoir plusieurs layouts possibles, chacun avec un poids qui détermine sa probabilité.

### Structure d'un Layout

```json
{
  "contents": {
    "basic": 1,                        // 1 carte de la sheet "basic"
    "commonWithShowcase": 10,         // 10 cartes de la sheet "commonWithShowcase"
    "dfcRareMythicWithShowcase": 1,   // 1 carte de la sheet "dfcRareMythicWithShowcase"
    "sfcUncommonWithShowcase": 3      // 3 cartes de la sheet "sfcUncommonWithShowcase"
  },
  "weight": 54                        // Poids de ce layout (probabilité relative)
}
```

### Exemple Concret (ZNR - Draft Booster)

**Layout #1** :
- Poids : 54
- Contenu :
  - 1× basic
  - 10× commonWithShowcase
  - 1× dfcRareMythicWithShowcase
  - 3× sfcUncommonWithShowcase

**Layout #2** :
- Poids : 27
- Contenu :
  - 1× basic
  - 9× commonWithShowcase
  - 1× dfcRareMythicWithShowcase
  - 1× foilWithShowcase (foil !)
  - 3× sfcUncommonWithShowcase

**Poids total** : 444

**Probabilité du Layout #1** : `54/444 ≈ 12.16%`
**Probabilité du Layout #2** : `27/444 ≈ 6.08%`

---

## 4. Calcul Pas à Pas de l'EV (Expected Value)

### Étape 1 : Calcul de l'EV d'une Sheet

Pour chaque sheet, on calcule la valeur attendue d'une carte tirée de cette sheet.

**Formule** :
```
EV_sheet = Σ (prix_carte × poids_carte / totalWeight_sheet)
```

**Exemple avec la sheet "commonWithShowcase"** :

Supposons qu'on ait 3 cartes :
- Carte A : poids=3, prix=0.10€
- Carte B : poids=3, prix=0.15€
- Carte C : poids=3, prix=0.05€
- Total weight = 303

```
EV_commonWithShowcase = 
  (3/303 × 0.10) + (3/303 × 0.15) + (3/303 × 0.05) + ... (pour toutes les 110 cartes)
```

**Dans le code** (`buildBoosterValuations`, lignes 244-272) :

```javascript
Object.entries(cards).forEach(([uuid, weight]) => {
  const price = getPrice(uuid, sheetConfig.foil ? 'foil' : undefined);
  const value = price?.value ?? 0;
  expectedValue += (weight / totalWeight) * value;
});
```

**Points importants** :
- Si `minPrice` est configuré et qu'une carte a un prix < minPrice, sa valeur est mise à 0
- On utilise le prix foil si la sheet contient des foils (`sheetConfig.foil === true`)
- La devise est déterminée par la première carte qui a un prix

---

### Étape 2 : Calcul de l'EV d'un Layout

Pour chaque layout, on multiplie la quantité de chaque sheet par son EV.

**Formule** :
```
EV_layout = Σ (quantité_sheet × EV_sheet)
```

**Exemple** :

Supposons qu'on ait calculé :
- EV_basic = 0.00€ (terrain de base)
- EV_commonWithShowcase = 0.50€
- EV_dfcRareMythicWithShowcase = 2.00€
- EV_sfcUncommonWithShowcase = 0.15€

Pour le Layout #1 (10× common, 1× rare, 3× uncommon, 1× basic) :

```
EV_layout1 = 
  (1 × 0.00) +           // basic
  (10 × 0.50) +          // commonWithShowcase
  (1 × 2.00) +           // dfcRareMythicWithShowcase
  (3 × 0.15)             // sfcUncommonWithShowcase
  = 0 + 5.00 + 2.00 + 0.45
  = 7.45€
```

**Dans le code** (lignes 281-283) :

```javascript
const layoutValue = Object.entries(layout.contents ?? {}).reduce(
  (sum, [sheetName, qty]) =>
    sum + qty * (sheetExpectations[sheetName]?.expectedValue ?? 0),
  0,
);
```

---

### Étape 3 : Calcul de l'EV Final du Booster

On fait une moyenne pondérée de tous les layouts.

**Formule** :
```
EV_booster = Σ (EV_layout × poids_layout) / poids_total
```

**Exemple** :

Supposons qu'on ait :
- Layout #1 : poids=54, EV=7.45€
- Layout #2 : poids=27, EV=6.50€ (avec foil)
- Layout #3 : poids=200, EV=7.20€
- Layout #4 : poids=163, EV=7.10€
- Poids total = 444

```
EV_booster = 
  (7.45 × 54 + 6.50 × 27 + 7.20 × 200 + 7.10 × 163) / 444
  = (402.30 + 175.50 + 1440.00 + 1157.30) / 444
  = 3174.10 / 444
  = 7.15€
```

**Dans le code** (lignes 275-287) :

```javascript
const totalLayoutWeight = layouts.reduce(
  (sum, layout) => sum + (layout.weight ?? 1),
  0,
);

let aggregatedValue = 0;
layouts.forEach((layout) => {
  const layoutValue = /* calculé à l'étape 2 */;
  aggregatedValue += layoutValue * (layout.weight ?? 1);
});

const averageValue = totalLayoutWeight > 0
  ? aggregatedValue / totalLayoutWeight
  : /* fallback si pas de poids */;
```

---

## 5. Gestion des Prix Minimum

Si un prix minimum est configuré (ex: 1€), toutes les cartes avec un prix < minPrice comptent comme 0€ dans le calcul.

**Dans le code** (lignes 228-238) :

```javascript
const getPrice = (uuid, preferredFinish) => {
  const price = pickLatestPrice(this.priceIndex[uuid], { preferredFinish }) || null;
  if (price && price.value < minPrice) {
    return { ...price, value: 0 };  // Mise à 0 si < minPrice
  }
  return price;
};
```

**Impact** : Cela permet de ne considérer que les cartes "significatives" dans le calcul d'EV, excluant les bulk cards.

---

## 6. Exemple Complet avec Données Réelles

### Données d'entrée

**Set** : Zendikar Rising (ZNR)
**Type de booster** : Draft
**Prix minimum** : 1.00€

### Calculs

1. **Sheet "commonWithShowcase"** :
   - 110 cartes, totalWeight = 303
   - Supposons que seulement 5 cartes valent > 1€ :
     - Carte A : poids=3, prix=1.50€ → contribution = 3/303 × 1.50 = 0.0149€
     - Carte B : poids=3, prix=2.00€ → contribution = 3/303 × 2.00 = 0.0198€
     - ...
   - EV_commonWithShowcase = 0.10€ (exemple)

2. **Sheet "dfcRareMythicWithShowcase"** :
   - 20 cartes, totalWeight = 50
   - Supposons que 15 cartes valent > 1€ :
     - Carte X : poids=2, prix=5.00€ → contribution = 2/50 × 5.00 = 0.20€
     - ...
   - EV_dfcRareMythicWithShowcase = 2.50€ (exemple)

3. **Layout #1** :
   - 10× common (0.10€) + 1× rare (2.50€) + 3× uncommon (0.20€) + 1× basic (0€)
   - EV_layout1 = 10×0.10 + 1×2.50 + 3×0.20 = 1.00 + 2.50 + 0.60 = 4.10€

4. **EV Final** :
   - Moyenne pondérée de tous les layouts
   - Résultat : ~4.50€ (exemple)

---

## 7. Visualisation dans l'Interface

Dans l'interface, vous pouvez :

1. **Voir l'EV de chaque booster type** dans le tableau principal
2. **Expander une ligne** pour voir le détail par sheet :
   - Nom de la sheet
   - EV par carte tirée de cette sheet
   - Nombre de cartes référencées
   - Indication si c'est une sheet foil

3. **Comparer avec le prix configuré** :
   - On utilise les prix de tendance définis dans `public/trend-prices-config.json`
   - La différence (EV - Prix) indique si le booster est rentable

---

## 8. Points Clés à Retenir

✅ **Les sheets** définissent les probabilités de chaque carte
✅ **Les layouts** définissent les combinaisons possibles de sheets
✅ **L'EV d'une sheet** = moyenne pondérée des prix des cartes
✅ **L'EV d'un layout** = somme des (quantité × EV_sheet)
✅ **L'EV du booster** = moyenne pondérée des EV_layouts
✅ **Le prix minimum** permet d'exclure les bulk cards
✅ **Les foils** sont gérés séparément avec leurs propres prix

---

## 9. Références du Code

- **Calcul des valuations** : `src/stores/mtgStore.js` → `buildBoosterValuations()` (lignes 225-295)
- **Extraction des prix** : `src/utils/priceExtractors.js` → `pickLatestPrice()`
- **Affichage** : `src/views/DashboardView.vue` → Section "Booster expected value"

---

*Document généré le 2025-01-27*

