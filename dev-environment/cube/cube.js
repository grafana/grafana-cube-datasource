module.exports = {
  driverFactory: () => ({
    type: 'duckdb',
    initSql: `
      ATTACH 'ducklake:postgres:host=postgres port=5432 dbname=ducklake_catalog user=user password=password'
        AS jaffle_shop (DATA_PATH '/cube/ducklake/', OVERRIDE_DATA_PATH TRUE);
      USE jaffle_shop;
    `,
  }),
};
