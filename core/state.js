/* Mutable caches shared across feature modules.
   Use object mutation (not reassignment) so importers always see current values. */

export const ordersState = {
  loaded: false,
  promise: null,
  cache: []
};

export const customersState = {
  loaded: false,
  cache: []
};

export function invalidateOrders() {
  ordersState.loaded = false;
  ordersState.promise = null;
}
