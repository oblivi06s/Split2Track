/** What an expense was for (food, transpo, accommodation, gift...). */
export class Category {
  constructor(id, name, shortName, icon, color) {
    this.id = id;
    this.name = name;
    this.shortName = shortName;
    this.icon = icon;
    this.color = color;
    Object.freeze(this);
  }

  static byId(id) {
    return Category.ALL.find((category) => category.id === id) ?? Category.OTHER;
  }
}

Category.FOOD = new Category('food', 'Food & Drinks', 'Food', '🍔', '#f2994a');
Category.TRANSPORTATION = new Category('transportation', 'Transportation', 'Transpo', '🚌', '#2f80ed');
Category.ACCOMMODATION = new Category('accommodation', 'Accommodation', 'Stay', '🏨', '#9b51e0');
Category.GIFT = new Category('gift', 'Gift', 'Gift', '🎁', '#eb5c9a');
Category.GROCERIES = new Category('groceries', 'Groceries', 'Groceries', '🛒', '#27ae60');
Category.ENTERTAINMENT = new Category('entertainment', 'Entertainment', 'Fun', '🎬', '#5b5bd6');
Category.SHOPPING = new Category('shopping', 'Shopping', 'Shopping', '🛍️', '#12a1a1');
Category.UTILITIES = new Category('utilities', 'Bills & Utilities', 'Bills', '💡', '#d4a106');
Category.HEALTH = new Category('health', 'Health', 'Health', '💊', '#eb5757');
Category.OTHER = new Category('other', 'Other', 'Other', '📦', '#828a99');

Category.ALL = Object.freeze([
  Category.FOOD,
  Category.TRANSPORTATION,
  Category.ACCOMMODATION,
  Category.GIFT,
  Category.GROCERIES,
  Category.ENTERTAINMENT,
  Category.SHOPPING,
  Category.UTILITIES,
  Category.HEALTH,
  Category.OTHER,
]);
