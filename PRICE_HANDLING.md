# Gestion des Prix Multiples pour les Cartes Non-Foil

## Question
Comment sont gérées les cartes non-foil qui apparaissent plusieurs fois dans la liste des prix ?

## Réponse Détaillée

### 1. Structure des Données de Prix

Dans `AllPricesToday.json`, chaque carte (identifiée par UUID) peut avoir :
- **Plusieurs vendors** : Cardmarket, TCGPlayer, CardKingdom, ManaPool, etc.
- **Plusieurs finishes** : normal, nonfoil, etched, foil
- **Plusieurs dates** : historique des prix pour chaque finish/vendor

Exemple de structure :
```json
{
  "uuid-carte-123": {
    "paper": {
      "cardmarket": {
        "retail": {
          "normal": {
            "2024-01-15": 1.50,
            "2024-01-20": 1.55
          },
          "nonfoil": {
            "2024-01-15": 1.50
          }
        },
        "currency": "EUR"
      },
      "tcgplayer": {
        "retail": {
          "normal": {
            "2024-01-15": 1.75
          }
        },
        "currency": "USD"
      }
    }
  }
}
```

### 2. Logique de Sélection du Prix

Le code utilise `pickLatestPrice()` dans `src/utils/priceExtractors.js` avec cette logique :

#### Priorité des Vendors
```javascript
const VENDOR_PRIORITY = ['cardmarket', 'tcgplayer', 'cardkingdom', 'manapool'];
```

#### Priorité des Finishes
```javascript
const BASE_FINISH_PRIORITY = ['normal', 'nonfoil', 'etched', 'foil'];
```

#### Algorithme de Sélection

1. **Parcours des mediums** : `['paper', 'mtgo']` (paper en priorité)
2. **Pour chaque medium**, parcours des vendors par ordre de priorité
3. **Pour chaque vendor**, parcours des finishes par ordre de priorité
4. **Prendre le prix le plus récent** pour le premier finish trouvé
5. **Retourner immédiatement** le premier prix valide trouvé

### 3. Comportement Actuel

**Pour une carte non-foil** :
- Le code cherche d'abord `normal`, puis `nonfoil`
- Si plusieurs vendors ont des prix, on prend celui du **premier vendor** selon la priorité (Cardmarket > TCGPlayer > CardKingdom > ManaPool)
- On ne fait **PAS** de moyenne entre les vendors
- On ne considère **PAS** tous les prix disponibles

**Exemple concret** :
```
Carte X a :
- Cardmarket normal: 1.50€ (2024-01-20)
- TCGPlayer normal: 1.75$ (2024-01-15)
- CardKingdom normal: 1.60$ (2024-01-18)

Résultat : On prend 1.50€ de Cardmarket (premier vendor dans la priorité)
```

### 4. Gestion dans les Calculs d'EV

Dans `buildBoosterValuations()` (ligne 260-264) :

```javascript
Object.entries(cards).forEach(([uuid, weight]) => {
  const price = getPrice(uuid, sheetConfig.foil ? 'foil' : undefined);
  const value = price?.value ?? 0;
  expectedValue += (weight / totalWeight) * value;
});
```

**Points importants** :
- Chaque UUID dans une sheet est traité **indépendamment**
- Si un UUID apparaît plusieurs fois dans la **même sheet** (ce qui ne devrait pas arriver), il serait compté plusieurs fois
- Si un UUID apparaît dans **plusieurs sheets** (ex: basic et foilWithShowcase), il est compté dans chaque sheet avec le prix approprié (foil vs non-foil)

### 5. Cas Particuliers

#### Cas 1 : Carte dans plusieurs sheets
```
UUID-123 apparaît dans :
- Sheet "basic" (foil=false) → prix non-foil utilisé
- Sheet "foilWithShowcase" (foil=true) → prix foil utilisé
```
✅ **Géré correctement** : Chaque sheet utilise le bon prix selon son flag `foil`

#### Cas 2 : Plusieurs vendors pour la même carte
```
UUID-123 a des prix chez :
- Cardmarket: 1.50€
- TCGPlayer: 1.75$
- CardKingdom: 1.60$
```
⚠️ **Comportement actuel** : On prend seulement Cardmarket (premier dans la priorité)

#### Cas 3 : Plusieurs finishes pour la même carte
```
UUID-123 a :
- normal: 1.50€
- nonfoil: 1.45€
```
✅ **Géré correctement** : On prend "normal" en premier (dans la priorité)

### 6. Limitations Actuelles

1. **Pas de moyenne entre vendors** : On prend seulement le premier vendor selon la priorité
2. **Pas de conversion de devise** : Si Cardmarket est en EUR et TCGPlayer en USD, on ne convertit pas
3. **Pas de fallback intelligent** : Si Cardmarket n'a pas de prix mais TCGPlayer oui, on ne le prend pas si Cardmarket existe (même sans prix)

### 7. Améliorations Possibles

Si vous voulez améliorer la gestion des prix multiples :

#### Option 1 : Moyenne des vendors
```javascript
// Collecter tous les prix disponibles
const allPrices = [];
for (const vendor of VENDOR_PRIORITY) {
  const price = getPriceForVendor(vendor);
  if (price) allPrices.push(price);
}
// Utiliser la moyenne
const averagePrice = allPrices.reduce((sum, p) => sum + p.value, 0) / allPrices.length;
```

#### Option 2 : Prix médian
```javascript
// Utiliser le prix médian plutôt que la moyenne pour éviter les outliers
const sortedPrices = allPrices.sort((a, b) => a.value - b.value);
const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
```

#### Option 3 : Conversion de devise
```javascript
// Convertir tous les prix en EUR avant de comparer/moyenner
const pricesInEUR = allPrices.map(p => convertToEUR(p.value, p.currency));
```

### 8. Code Actuel (Référence)

**Fichier** : `src/utils/priceExtractors.js`
- Fonction `pickLatestPrice()` : lignes 50-94
- Priorité vendors : ligne 1
- Priorité finishes : ligne 2

**Fichier** : `src/stores/mtgStore.js`
- Fonction `buildBoosterValuations()` : lignes 225-295
- Utilisation de `getPrice()` : ligne 261

---

## Conclusion

Actuellement, pour les cartes non-foil qui apparaissent plusieurs fois dans les prix :
- ✅ On gère correctement les différents finishes (normal vs nonfoil)
- ✅ On gère correctement les cartes dans plusieurs sheets (foil vs non-foil)
- ⚠️ On prend seulement le premier vendor selon la priorité (pas de moyenne)
- ⚠️ Pas de conversion de devise automatique

Le comportement est **déterministe** et **prévisible**, mais pourrait être amélioré pour prendre en compte tous les prix disponibles plutôt que seulement le premier.

