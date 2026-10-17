/**
 * Merchant category codes (ISO 18245) of card payments, grouped into the default subcategories.
 * Not mapped on purpose: airlines, hotels, software and digital goods, recreation, newsstands,
 * cash and financial institutions, money transfers.
 */
const GROUPS = {
    groceries: [5411, 5422, 5441, 5451, 5462, 5499],
    'eating-out': [5811, 5812, 5813, 5814],
    transport: [4011, 4111, 4112, 4121, 4131, 4784, 4789, 5541, 5542, 7512, 7523],
    utilities: [4814, 4899, 4900],
    health: [5122, 5912, 8011, 8021, 8031, 8041, 8042, 8043, 8049, 8050, 8062, 8071, 8099],
    insurance: [6300],
    shopping: [
        5200, 5251, 5261, 5310, 5311, 5611, 5621, 5631, 5641, 5651, 5655, 5661, 5691, 5699,
        5712, 5719, 5722, 5732, 5733, 5941, 5942, 5945, 5977, 5992, 5999,
    ],
};

const SUBCATEGORY_BY_MCC = new Map(
    Object.entries(GROUPS).flatMap(([id, codes]) => codes.map((code) => [String(code), id])),
);

/** Default subcategory id for a four-digit MCC, or '' when the code is unknown or not mapped. */
export function subcategoryForMcc(mcc) {
    const code = String(mcc ?? '').trim();
    return /^\d{4}$/.test(code) ? SUBCATEGORY_BY_MCC.get(code) ?? '' : '';
}
