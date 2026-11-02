import { h } from '../dom.js';
import { View } from '../View.js';
import { section, avatar, categoryBreakdown, toast } from '../components.js';
import { field, textInput, selectInput, button } from '../forms.js';
import { Money } from '../../services/Money.js';
import { BalanceService } from '../../services/BalanceService.js';
import { SampleData } from '../../services/SampleData.js';

/** Profile, currency, your spending, and backup tools. */
export class AccountView extends View {
  get title() {
    return 'Account';
  }

  get tab() {
    return 'account';
  }

  render() {
    const me = this.store.me;
    const nameInput = textInput({ value: me.name });
    nameInput.addEventListener('change', () => {
      try {
        this.store.renamePerson(me.id, nameInput.value);
        toast('Name saved');
      } catch (e) {
        toast(e.message);
        nameInput.value = me.name;
      }
    });

    const myTotals = BalanceService.categoryTotals(this.store.expensesFor(), me.id);

    return h(
      'div',
      {},
      h(
        'div',
        { class: 'card pad profile' },
        avatar(me, 56),
        h('div', { class: 'grow' }, field('Your name', nameInput)),
      ),
      h(
        'div',
        { class: 'card pad' },
        field(
          'Currency',
          selectInput(
            Money.CURRENCIES.map((c) => ({ value: c, label: `${c} (${Money.symbol(c)})` })),
            this.store.currency,
            (value) => this.store.setCurrency(value),
          ),
          'Changes how amounts are shown. It does not convert money.',
        ),
      ),
      section('Your share of spending', h('div', { class: 'pad' }, categoryBreakdown(myTotals, this.store.currency))),
      section(
        'Your data',
        h(
          'div',
          { class: 'pad button-col' },
          h('p', { class: 'muted small' }, 'Data is saved in this browser only. Export a backup to move it to another phone.'),
          button('⬇️ Export backup', () => this.#export(), { kind: 'secondary', block: true }),
          this.#importButton(),
          button('✨ Load sample data', () => this.#sample(), { kind: 'secondary', block: true }),
          button('Erase all data', () => this.#erase(), { kind: 'danger', block: true }),
        ),
      ),
      h('p', { class: 'muted small center' }, 'Split2Track v1.0 · Made by John Michael Jabuen'),
    );
  }

  #export() {
    const blob = new Blob([JSON.stringify(this.store.toJSON(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `split2track-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  #importButton() {
    const input = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      hidden: true,
      onChange: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          if (!confirm('Replace all current data with this backup?')) return;
          this.store.importJSON(data);
          toast('Backup restored');
        } catch (e) {
          toast(e instanceof SyntaxError ? 'That file is not valid JSON' : e.message);
        } finally {
          event.target.value = '';
        }
      },
    });
    return h('div', {}, input, button('⬆️ Import backup', () => input.click(), { kind: 'secondary', block: true }));
  }

  #sample() {
    if (!confirm('Add demo friends, groups, and expenses?')) return;
    SampleData.load(this.store);
    toast('Sample data added');
    this.go('#/groups');
  }

  #erase() {
    if (!confirm('Erase all groups, friends, and expenses? Your name and currency stay. This cannot be undone.')) return;
    this.store.eraseAll();
    toast('All data erased');
  }
}
