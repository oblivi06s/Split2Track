import { SplitStrategy } from './SplitStrategy.js';
import { Category } from '../models/Category.js';

/** Adds demo groups, friends, and expenses so you can try the app fast. */
export class SampleData {
  static load(store) {
    const me = store.me;
    if (!me) throw new Error('Create your profile first');

    const ana = store.addFriend('Ana');
    const ben = store.addFriend('Ben');
    const carla = store.addFriend('Carla');
    const everyone = [me.id, ana.id, ben.id, carla.id];

    const trip = store.createGroup({ name: 'Baguio Trip', emoji: '🏔️', memberIds: [ana.id, ben.id, carla.id] });
    const home = store.createGroup({ name: 'Apartment', emoji: '🏠', memberIds: [ana.id] });

    const daysAgo = (n) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      const pad = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const equal = SplitStrategy.for('equal');
    const add = (title, pesos, category, payerId, participantIds, groupId, ago) => {
      const amountCents = pesos * 100;
      const { shares } = equal.split(amountCents, { participantIds });
      store.saveExpense({
        title,
        amountCents,
        categoryId: category.id,
        splitMethod: 'equal',
        payerId,
        groupId,
        shares,
        date: daysAgo(ago),
      });
    };

    add('Bus tickets', 2400, Category.TRANSPORTATION, me.id, everyone, trip.id, 12);
    add('Airbnb (2 nights)', 9000, Category.ACCOMMODATION, ana.id, everyone, trip.id, 11);
    add('Strawberry farm lunch', 1850, Category.FOOD, ben.id, everyone, trip.id, 10);
    add('Pasalubong for Lola', 1200, Category.GIFT, carla.id, everyone, trip.id, 9);
    add('Taxi to Session Road', 360, Category.TRANSPORTATION, me.id, everyone, trip.id, 9);
    add('Groceries', 3200, Category.GROCERIES, me.id, [me.id, ana.id], home.id, 5);
    add('Electric bill', 2800, Category.UTILITIES, ana.id, [me.id, ana.id], home.id, 3);
    add('Movie night', 900, Category.ENTERTAINMENT, me.id, [me.id, ben.id], null, 1);

    store.recordSettlement({ fromId: carla.id, toId: me.id, amountCents: 60000, groupId: trip.id, date: daysAgo(2) });
  }
}
