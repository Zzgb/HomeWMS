import {
  listWarehouses,
  addWarehouse,
  removeWarehouse,
  updateWarehouse,
  testConnection,
  getWarehouseClient,
} from "@/lib/connections";

export const storeService = {
  listStores: listWarehouses,
  addStore: addWarehouse,
  deleteStore: removeWarehouse,
  updateStore: updateWarehouse,
  testConnection,
  getClient: getWarehouseClient,
};
