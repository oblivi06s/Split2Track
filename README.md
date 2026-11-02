# Split2Track 💸

Split shared expenses with friends, and track **what** every expense was for: food, transportation, accommodation, gifts, and more.

A free, installable web app (PWA). Use it on one device with no sign-up, or create a free account to share groups with friends (synced with Supabase).

## Features

- **Groups & friends:** make groups like "Baguio Trip" and add members.
- **Add expenses:** split equally, by exact amounts, or by percent.
- **Categories:** Food, Transportation, Accommodation, Gift, Groceries, Entertainment, Shopping, Bills, Health, Other.
- **Balances & settle up:** see who owes who. Debts are simplified into the fewest payments.
- **Activity feed:** grouped by month, with a filter by category.
- **Spending charts:** per group, plus your own share by category.
- **Share with friends (cloud mode):** sign in, send an invite link, and everyone in the group sees the same expenses live.
- **Invite by email:** add a friend's email. When they sign in (or sign up) with it, your shared groups and expenses appear in their account automatically.
- **Claim your name:** if a friend already added you, pick your name when you join and their expenses with you carry over.
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

## Cloud sync setup (Supabase, free)

1. In Supabase, open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and click **Run**.
2. Go to **Authentication → Sign In / Providers → Email** and turn **off** "Confirm email". The free email service only sends a few emails per hour. You can turn it back on later with your own email provider.
3. Go to **Authentication → URL Configuration**. Set **Site URL** to your GitHub Pages link (for example `https://oblivi06s.github.io/Split2Track/`).
4. Put your project URL and **publishable** key in `js/config.js`. Never put the secret/service_role key there.

The security rules in `schema.sql` make sure people only see groups they belong to. They are tested in `supabase/tests/rls_test.sql`:

```bash
psql -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stub.sql -f supabase/schema.sql -f supabase/tests/rls_test.sql
```

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
├── cloud/             Supabase sync
│   ├── CloudService.js  All network calls (login, data, invites, live updates)
│   ├── RemoteMapper.js  App data <-> database rows, and "what changed" diffs
│   ├── CloudStorageAdapter.js  Offline copy + last confirmed server version
│   └── CloudSync.js     Uploads changes, downloads updates, handles offline
├── vendor/            supabase-js browser build (MIT)
├── config.js          Supabase URL + publishable key
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
| **Abstraction / interfaces** | `StorageAdapter` defines `load()` and `save()`. `LocalStorageAdapter` and `CloudStorageAdapter` both follow it, so the screens work the same in both modes. |
| **Design patterns** | Strategy (splits), Repository + Observer (`AppStore`), Adapter (storage), simple Registry (`SplitStrategy.for()`). |

### How the money math works

- All amounts are stored as **whole cents** (integers), so there are no rounding errors.
- Every split adds up to the exact total. Leftover cents go to specific people.
- **Net balance** = what you paid for others − what others paid for you ± payments.
- **Simplify debts:** the person who owes the most pays the person owed the most, and so on.

### How cloud sync works

- The app keeps working from a copy on the device, so it is fast and works offline.
- When you change something, `CloudSync` compares it with the last version the server confirmed and uploads only the difference.
- When anyone in your groups changes something, Supabase Realtime tells the app, and it downloads the latest data.
- Offline changes wait on the device and upload when you are back online.

## License

MIT
