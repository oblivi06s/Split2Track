# Split2Track 💸

Split shared expenses with friends, and track **what** every expense was for: food, transportation, accommodation, gifts, and more.

A free, installable web app (PWA). No sign-up and no server. Data stays on your device.

## Features

- **Groups & friends:** make groups like "Baguio Trip" and add members.
- **Add expenses:** split equally, by exact amounts, or by percent.
- **Categories:** Food, Transportation, Accommodation, Gift, Groceries, Entertainment, Shopping, Bills, Health, Other.
- **Balances & settle up:** see who owes who. Debts are simplified into the fewest payments.
- **Activity feed:** grouped by month, with a filter by category.
- **Spending charts:** per group, plus your own share by category.
- **Backup:** export and import your data as a JSON file.
- **Works offline** and can be added to your phone's home screen. Supports dark mode.

## Run it locally

You don't need any packages. Start a static server in the project folder:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Run the tests

You need Node.js 20 or newer.

```bash
npm test
```

## Deploy to GitHub Pages

1. Push to the `main` branch.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set Source to **Deploy from a branch**, then pick `main` and `/ (root)`.
4. Your app will be live at `https://<your-username>.github.io/split2track/`.

After you change files, bump `VERSION` in `sw.js` so phones load the new version.

## Project structure (OOP + modules)

```
js/
├── models/            Data classes (what we store)
│   ├── Entity.js        Base class: id + createdAt (inheritance)
│   ├── Person.js        You or a friend
│   ├── Group.js         A group of people
│   ├── Category.js      Food, Transpo, Gift... (fixed list)
│   ├── Expense.js       A bill and each person's share
│   └── Settlement.js    A payment between two people
├── services/          Business logic (no browser needed, fully tested)
│   ├── Money.js         Cents-based money parsing and formatting
│   ├── SplitStrategy.js Strategy pattern: Equal / Exact / Percent splits
│   ├── BalanceService.js Net balances, debt simplification, category totals
│   └── SampleData.js    Demo data
├── storage/           Saving data
│   ├── StorageAdapter.js Interface + LocalStorage and Memory versions
│   └── AppStore.js      Repository + Observer: owns all data, notifies screens
└── ui/                Screens
    ├── App.js           Wires the store, router, and screens together
    ├── Router.js        Hash-based routing (#/groups/123)
    ├── View.js          Base class every screen extends
    ├── dom.js, forms.js, components.js  Reusable UI building blocks
    └── views/           One class per screen
```

### OOP concepts used

| Concept | Where |
| --- | --- |
| **Inheritance** | `Person`, `Group`, `Expense`, `Settlement` extend `Entity`. Every screen extends `View`. |
| **Polymorphism** | `EqualSplit`, `ExactSplit`, `PercentSplit` all have `split()`. The form calls it without knowing which one it has. |
| **Encapsulation** | `AppStore` hides its data maps and uses private `#methods`. Screens change data only through its public methods. |
| **Abstraction / interfaces** | `StorageAdapter` defines `load()` and `save()`. Swap `LocalStorageAdapter` for a cloud version later without touching the screens. |
| **Design patterns** | Strategy (splits), Repository + Observer (`AppStore`), Adapter (storage), simple Registry (`SplitStrategy.for()`). |

### How the money math works

- All amounts are stored as **whole cents** (integers), so there are no rounding errors.
- Every split adds up to the exact total. Leftover cents go to specific people.
- **Net balance** = what you paid for others − what others paid for you ± payments.
- **Simplify debts:** the person who owes the most pays the person owed the most, and so on.

## License

MIT
