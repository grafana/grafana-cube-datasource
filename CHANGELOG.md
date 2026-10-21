# Changelog

## [0.7.0](https://github.com/grafana/grafana-cube-datasource/compare/v0.6.6...v0.7.0) (2026-10-21)


### ⚠ BREAKING CHANGES

* remove legacy order object format and cubeApiUrl jsonData field ([#318](https://github.com/grafana/grafana-cube-datasource/issues/318))

### Features

* Add compile-time type checking against @cubejs-client/core types ([#59](https://github.com/grafana/grafana-cube-datasource/issues/59)) ([0e2d7c4](https://github.com/grafana/grafana-cube-datasource/commit/0e2d7c4f9990b7089bb66867c804fad3295ae4fc))
* Align timeDimensions + order typing with Cube official types ([#64](https://github.com/grafana/grafana-cube-datasource/issues/64)) ([2064591](https://github.com/grafana/grafana-cube-datasource/commit/20645910e620c2ad1fe7d8ad66e43ebabda0d844))
* always show Data Model tab hint after Save & Test ([#189](https://github.com/grafana/grafana-cube-datasource/issues/189)) ([7e16154](https://github.com/grafana/grafana-cube-datasource/commit/7e16154b180f81d970d3feb10816441b051ecdaa))
* **dashboards:** refresh provisioned demo dashboards ([2b90de7](https://github.com/grafana/grafana-cube-datasource/commit/2b90de750f71f3da1d9267b32342fc5c83ebc2df))
* **dashboards:** refresh provisioned demo dashboards ([72c7e91](https://github.com/grafana/grafana-cube-datasource/commit/72c7e91d41ba83c84cc3b3771d894dd5c467792c))
* detect template variables in filter values and show JSON viewer ([#140](https://github.com/grafana/grafana-cube-datasource/issues/140)) ([cf170d7](https://github.com/grafana/grafana-cube-datasource/commit/cf170d7fb1a65f626cd2f2e479e2b14031e675c2))
* **dev-env:** add the RevOps Territory Navigator demo on PostgreSQL ([#614](https://github.com/grafana/grafana-cube-datasource/issues/614)) ([63f26a2](https://github.com/grafana/grafana-cube-datasource/commit/63f26a283d439724768a7088e7fb042616ef2a63))
* **format:** support Cube measure format → Grafana units ([#246](https://github.com/grafana/grafana-cube-datasource/issues/246)) ([#459](https://github.com/grafana/grafana-cube-datasource/issues/459)) ([2185fde](https://github.com/grafana/grafana-cube-datasource/commit/2185fde38ecc7c616f3003165525c30ab004c10a))
* guide users to Data Model tab when no cubes exist ([#148](https://github.com/grafana/grafana-cube-datasource/issues/148)) ([49cfe1c](https://github.com/grafana/grafana-cube-datasource/commit/49cfe1cd77f6f4033337b0829e01dd32ad67ad1d))
* remove legacy order object format and cubeApiUrl jsonData field ([#318](https://github.com/grafana/grafana-cube-datasource/issues/318)) ([0e02222](https://github.com/grafana/grafana-cube-datasource/commit/0e02222a37ad75f5e1f5718aba3e66ecd1cbe40e))
* show JSON viewer when query has unsupported visual builder features ([#136](https://github.com/grafana/grafana-cube-datasource/issues/136)) ([354ec16](https://github.com/grafana/grafana-cube-datasource/commit/354ec16426f53d63be9034960921af9f89191e59))
* support all Cube filter operators in panel JSON ([#138](https://github.com/grafana/grafana-cube-datasource/issues/138)) ([e60a7f6](https://github.com/grafana/grafana-cube-datasource/commit/e60a7f6a33526f1c537a96589cf443516195cc75))
* support AND/OR logical filter groups in panel JSON ([#139](https://github.com/grafana/grafana-cube-datasource/issues/139)) ([fdea321](https://github.com/grafana/grafana-cube-datasource/commit/fdea3216e4aae1d7b37435e4ff4d024bc502ff80))
* surface Cube measure/dimension descriptions in query editor dropdowns ([#235](https://github.com/grafana/grafana-cube-datasource/issues/235)) ([bf510dc](https://github.com/grafana/grafana-cube-datasource/commit/bf510dcd345f2390785137c378632a55de75b394))
* use standard datasource URL for Cube API endpoint ([8607a6c](https://github.com/grafana/grafana-cube-datasource/commit/8607a6c73aeab452f27aae9e5490e2f6546e773f))
* use standard datasource URL for Cube API endpoint ([#177](https://github.com/grafana/grafana-cube-datasource/issues/177)) ([cd7a699](https://github.com/grafana/grafana-cube-datasource/commit/cd7a6990cf51ea3f881a25bd0b01414674db604e))


### Bug Fixes

* **adhoc:** drop AdHoc filters inapplicable to a query's Cube view ([#307](https://github.com/grafana/grafana-cube-datasource/issues/307)) ([#495](https://github.com/grafana/grafana-cube-datasource/issues/495)) ([dc4130d](https://github.com/grafana/grafana-cube-datasource/commit/dc4130dabc5e453d10d521f0f618966f6868d20c))
* **adhoc:** partition getTagValues scoping filters + time dimension by view ([#498](https://github.com/grafana/grafana-cube-datasource/issues/498)) ([#499](https://github.com/grafana/grafana-cube-datasource/issues/499)) ([fe0ba7e](https://github.com/grafana/grafana-cube-datasource/commit/fe0ba7ec854062073952b9c1e26cac985ede27d6))
* **adhoc:** scope filter values by dashboard time range ($cubeTimeDimension) ([#35](https://github.com/grafana/grafana-cube-datasource/issues/35)) ([#454](https://github.com/grafana/grafana-cube-datasource/issues/454)) ([84a3613](https://github.com/grafana/grafana-cube-datasource/commit/84a3613b58aeaa3366a402f175e177bb6743f423))
* **adhoc:** wire AdHoc filters via request.filters ([#127](https://github.com/grafana/grafana-cube-datasource/issues/127)) + [#307](https://github.com/grafana/grafana-cube-datasource/issues/307) demo ([#507](https://github.com/grafana/grafana-cube-datasource/issues/507)) ([c45b7f3](https://github.com/grafana/grafana-cube-datasource/commit/c45b7f3ec01ff333e999e4e994792b6e42928dbb))
* align Continue wait retry behavior with Cube SDK ([#117](https://github.com/grafana/grafana-cube-datasource/issues/117)) ([6c62ada](https://github.com/grafana/grafana-cube-datasource/commit/6c62ada0f67763f6c7b22f2185862b4a92d54346))
* align plugin bundle and dev provisioning for React 19 ([#125](https://github.com/grafana/grafana-cube-datasource/issues/125)) ([e8b26a6](https://github.com/grafana/grafana-cube-datasource/commit/e8b26a63870cccd525556b477eb1058df8a873ca))
* **backend:** preserve upstream /v1/load status + transient retry & transport classification ([#118](https://github.com/grafana/grafana-cube-datasource/issues/118)) ([#431](https://github.com/grafana/grafana-cube-datasource/issues/431)) ([c51844b](https://github.com/grafana/grafana-cube-datasource/commit/c51844b7620d3315e500379b80449a83b19e19f2))
* **config:** write URL to both standard url and legacy cubeApiUrl fields ([789653f](https://github.com/grafana/grafana-cube-datasource/commit/789653fdd1ec882d07b434c06b71d1e0ca8da168))
* **deps:** apply js-yaml override to @istanbuljs/load-nyc-config ([#563](https://github.com/grafana/grafana-cube-datasource/issues/563)) ([7ca859c](https://github.com/grafana/grafana-cube-datasource/commit/7ca859cd9ded3f4634fade18c016312484824fa4))
* **deps:** bump fast-uri to 3.1.5 to fix CVE-2026-18446 ([#535](https://github.com/grafana/grafana-cube-datasource/issues/535)) ([62151c5](https://github.com/grafana/grafana-cube-datasource/commit/62151c54dd68cf870f1633e81a494a0e570584a5))
* **deps:** force brace-expansion 5.0.8 via minimatch 10 override (GHSA-mh99-v99m-4gvg) ([#476](https://github.com/grafana/grafana-cube-datasource/issues/476)) ([f52495c](https://github.com/grafana/grafana-cube-datasource/commit/f52495cc4b60e1fcac22f5b874add6b7fa285137))
* **deps:** remediate Dependabot alerts for lodash and qs ([#128](https://github.com/grafana/grafana-cube-datasource/issues/128)) ([b7252b3](https://github.com/grafana/grafana-cube-datasource/commit/b7252b338cc5d18d5e480f47cea9bba5015b8239))
* **deps:** update all non-major dependencies ([#104](https://github.com/grafana/grafana-cube-datasource/issues/104)) ([f188bd8](https://github.com/grafana/grafana-cube-datasource/commit/f188bd867c0a2b5e6872e0dcc33f8d47c4de62d1))
* **deps:** update all non-major dependencies ([#111](https://github.com/grafana/grafana-cube-datasource/issues/111)) ([88293d5](https://github.com/grafana/grafana-cube-datasource/commit/88293d5807fc4f32e88cb94da8689df16afa7be5))
* **deps:** update all non-major dependencies ([#144](https://github.com/grafana/grafana-cube-datasource/issues/144)) ([f1bcb2d](https://github.com/grafana/grafana-cube-datasource/commit/f1bcb2d5961cda222ff0985670d260ae821cd462))
* **deps:** update all non-major dependencies ([#152](https://github.com/grafana/grafana-cube-datasource/issues/152)) ([5902a28](https://github.com/grafana/grafana-cube-datasource/commit/5902a2895102ff195bef00d0356d4e3898d572af))
* **deps:** update all non-major dependencies ([#158](https://github.com/grafana/grafana-cube-datasource/issues/158)) ([9012e2e](https://github.com/grafana/grafana-cube-datasource/commit/9012e2e911702b9a97146248259b8191fa4c287f))
* **deps:** update all non-major dependencies ([#170](https://github.com/grafana/grafana-cube-datasource/issues/170)) ([9ebf4b6](https://github.com/grafana/grafana-cube-datasource/commit/9ebf4b673865c4a9f1ecc64841d0c24fe5e384fa))
* **deps:** update all non-major dependencies ([#231](https://github.com/grafana/grafana-cube-datasource/issues/231)) ([5ee89bb](https://github.com/grafana/grafana-cube-datasource/commit/5ee89bb0c4a209041d0f6c4035c3e6bbb276be38))
* **deps:** update all non-major dependencies ([#232](https://github.com/grafana/grafana-cube-datasource/issues/232)) ([03d689a](https://github.com/grafana/grafana-cube-datasource/commit/03d689afaa63db8b3b8daf5dc6255cad143b0321))
* **deps:** update all non-major dependencies ([#238](https://github.com/grafana/grafana-cube-datasource/issues/238)) ([2ca644f](https://github.com/grafana/grafana-cube-datasource/commit/2ca644fc55065627a15e5319b5c75165d8c181cd))
* **deps:** update all non-major dependencies ([#244](https://github.com/grafana/grafana-cube-datasource/issues/244)) ([8927667](https://github.com/grafana/grafana-cube-datasource/commit/8927667f953514e4b64311902130899f337fb7f5))
* **deps:** update all non-major dependencies ([#255](https://github.com/grafana/grafana-cube-datasource/issues/255)) ([6bca561](https://github.com/grafana/grafana-cube-datasource/commit/6bca56153d8fade96205284b65cf991d01576f73))
* **deps:** update all non-major dependencies ([#257](https://github.com/grafana/grafana-cube-datasource/issues/257)) ([d64379c](https://github.com/grafana/grafana-cube-datasource/commit/d64379cac69f8ecfd5c023919d22b2e1dfec0062))
* **deps:** update all non-major dependencies ([#264](https://github.com/grafana/grafana-cube-datasource/issues/264)) ([c9aa114](https://github.com/grafana/grafana-cube-datasource/commit/c9aa11457fe2d06776058c53eb2c71ce49dce379))
* **deps:** update all non-major dependencies ([#277](https://github.com/grafana/grafana-cube-datasource/issues/277)) ([50b5f07](https://github.com/grafana/grafana-cube-datasource/commit/50b5f070b82dc07c612b400ac56ed04e2be193d5))
* **deps:** update all non-major dependencies ([#282](https://github.com/grafana/grafana-cube-datasource/issues/282)) ([e2d5b0c](https://github.com/grafana/grafana-cube-datasource/commit/e2d5b0caec62bb702fb9a2d868eeeeb2fbda197a))
* **deps:** update all non-major dependencies ([#283](https://github.com/grafana/grafana-cube-datasource/issues/283)) ([8d44c40](https://github.com/grafana/grafana-cube-datasource/commit/8d44c40d6481d907d144a8f56403a07598c2f913))
* **deps:** update all non-major dependencies ([#293](https://github.com/grafana/grafana-cube-datasource/issues/293)) ([e07397e](https://github.com/grafana/grafana-cube-datasource/commit/e07397e8d1acc44807b048e661c434445040cd0d))
* **deps:** update all non-major dependencies ([#298](https://github.com/grafana/grafana-cube-datasource/issues/298)) ([8ebcffb](https://github.com/grafana/grafana-cube-datasource/commit/8ebcffb2b0f42340ac4770678cba2c255548446c))
* **deps:** update all non-major dependencies ([#311](https://github.com/grafana/grafana-cube-datasource/issues/311)) ([906040c](https://github.com/grafana/grafana-cube-datasource/commit/906040c375e6b4455d71f9623208ee7a730842dd))
* **deps:** update all non-major dependencies ([#322](https://github.com/grafana/grafana-cube-datasource/issues/322)) ([7833059](https://github.com/grafana/grafana-cube-datasource/commit/78330595e43f4bf1210e00ef2f87c2047b920d66))
* **deps:** update all non-major dependencies ([#94](https://github.com/grafana/grafana-cube-datasource/issues/94)) ([6727cfb](https://github.com/grafana/grafana-cube-datasource/commit/6727cfb20cadce32cb9794bcd761bf15846299f1))
* **deps:** update all non-major dependencies to v12.3.2 ([#88](https://github.com/grafana/grafana-cube-datasource/issues/88)) ([e7f8fa9](https://github.com/grafana/grafana-cube-datasource/commit/e7f8fa925fcf3a3275eeb3208b83e7564dc80c2a))
* **deps:** update all non-major dependencies to v5.100.6 ([#308](https://github.com/grafana/grafana-cube-datasource/issues/308)) ([ea15a8a](https://github.com/grafana/grafana-cube-datasource/commit/ea15a8a9dc3f012d26119fa6567e988e36945b1e))
* **deps:** update all non-major dependencies to v5.95.1 ([#237](https://github.com/grafana/grafana-cube-datasource/issues/237)) ([034fc97](https://github.com/grafana/grafana-cube-datasource/commit/034fc977b195ff8fe36207bf2f94c4b16e12cbf6))
* **deps:** update dependency @grafana/plugin-ui to v0.17.1 ([#413](https://github.com/grafana/grafana-cube-datasource/issues/413)) ([5529e5d](https://github.com/grafana/grafana-cube-datasource/commit/5529e5dd56d98cc3c6b7b2e91e4b9554372f69ab))
* **deps:** update dependency @grafana/plugin-ui to v0.17.2 ([#451](https://github.com/grafana/grafana-cube-datasource/issues/451)) ([971cf18](https://github.com/grafana/grafana-cube-datasource/commit/971cf18b16e9101484f1deece99754c394dc5b71))
* **deps:** update dependency @grafana/plugin-ui to v0.17.3 ([#456](https://github.com/grafana/grafana-cube-datasource/issues/456)) ([1283a59](https://github.com/grafana/grafana-cube-datasource/commit/1283a59d62769e9ea97cc226fce56591ab74bd2c))
* **deps:** update dependency @grafana/plugin-ui to v0.17.4 ([#577](https://github.com/grafana/grafana-cube-datasource/issues/577)) ([7aa0888](https://github.com/grafana/grafana-cube-datasource/commit/7aa08880a6cb6f12736335ff6e655e216e2278c3))
* **deps:** update dependency @tanstack/react-query to v5.90.20 ([#68](https://github.com/grafana/grafana-cube-datasource/issues/68)) ([d877392](https://github.com/grafana/grafana-cube-datasource/commit/d8773927bcae1904bf042ad2d9d29747e0948069))
* **deps:** update dependency @tanstack/react-query to v5.91.0 ([#224](https://github.com/grafana/grafana-cube-datasource/issues/224)) ([8c66915](https://github.com/grafana/grafana-cube-datasource/commit/8c66915e64cddb58a1adefc0a022f8a179e47674))
* **deps:** update dependency @tanstack/react-query to v5.91.2 ([#227](https://github.com/grafana/grafana-cube-datasource/issues/227)) ([cf73c8b](https://github.com/grafana/grafana-cube-datasource/commit/cf73c8b5315b74a6fc1ca0139cac92e37e255ad4))
* **deps:** update dependency @tanstack/react-query to v5.91.3 ([#228](https://github.com/grafana/grafana-cube-datasource/issues/228)) ([3158eb2](https://github.com/grafana/grafana-cube-datasource/commit/3158eb2f81f34d0869f780d3c576ee313289cd35))
* **deps:** update dependency @tanstack/react-query-devtools to v5.100.1 ([#294](https://github.com/grafana/grafana-cube-datasource/issues/294)) ([6cd8f40](https://github.com/grafana/grafana-cube-datasource/commit/6cd8f40ceeef1411a93b71441fe68a65a01fd125))
* **deps:** update fast-uri to 3.1.4 (CVE-2026-16221) ([#410](https://github.com/grafana/grafana-cube-datasource/issues/410)) ([1052d46](https://github.com/grafana/grafana-cube-datasource/commit/1052d46ba9b4c45af534de6299c93e0d13c373a7))
* **deps:** update fast-uri to patched 3.1.3 (CVE-2026-13676) ([#406](https://github.com/grafana/grafana-cube-datasource/issues/406)) ([6bdb84c](https://github.com/grafana/grafana-cube-datasource/commit/6bdb84cc4f5eabb17f3aff9be7bfdcd8f8361ca5))
* **deps:** update grafana monorepo to v13 ([#284](https://github.com/grafana/grafana-cube-datasource/issues/284)) ([35f1614](https://github.com/grafana/grafana-cube-datasource/commit/35f16141edd3e20cc278a3201781cff1d38b7e9a))
* **deps:** update grafana monorepo to v13 ([#317](https://github.com/grafana/grafana-cube-datasource/issues/317)) ([df018ac](https://github.com/grafana/grafana-cube-datasource/commit/df018ac78c1f02f41882f413002c0d942e0e5d0d))
* **deps:** update grafana monorepo to v13.1.0 ([#414](https://github.com/grafana/grafana-cube-datasource/issues/414)) ([ab8e5ec](https://github.com/grafana/grafana-cube-datasource/commit/ab8e5ecbc4a877dabf87261a110cb9543c30558f))
* **deps:** update grafana monorepo to v13.1.1 ([#448](https://github.com/grafana/grafana-cube-datasource/issues/448)) ([47230b9](https://github.com/grafana/grafana-cube-datasource/commit/47230b92706d77cb054701e2c901357167b248e7))
* **deps:** update grafana monorepo to v13.1.2 ([#544](https://github.com/grafana/grafana-cube-datasource/issues/544)) ([f53ba8f](https://github.com/grafana/grafana-cube-datasource/commit/f53ba8f4e87f5320b23aa4c56cfa37ae7975079e))
* **deps:** update grafana monorepo to v13.1.3 ([#556](https://github.com/grafana/grafana-cube-datasource/issues/556)) ([8aedab8](https://github.com/grafana/grafana-cube-datasource/commit/8aedab8d9323f25cef7db8d4896271c29d0ff7cf))
* **deps:** update js-yaml to patched 4.3.0/3.15.0 (CVE-2026-59869) ([#383](https://github.com/grafana/grafana-cube-datasource/issues/383)) ([a792b10](https://github.com/grafana/grafana-cube-datasource/commit/a792b10aedc0d26567897d0190f6ec0420a7777d))
* **deps:** update module github.com/golang-jwt/jwt/v5 to v5.3.1 ([#90](https://github.com/grafana/grafana-cube-datasource/issues/90)) ([9cf4838](https://github.com/grafana/grafana-cube-datasource/commit/9cf483878258701282797610709a6ca091f6231e))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.286.0 ([#55](https://github.com/grafana/grafana-cube-datasource/issues/55)) ([1f5c029](https://github.com/grafana/grafana-cube-datasource/commit/1f5c02912ff1da09a0a07783660d49e45e3319ca))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.290.0 ([#168](https://github.com/grafana/grafana-cube-datasource/issues/168)) ([468fd06](https://github.com/grafana/grafana-cube-datasource/commit/468fd067ef3f7eb4234ede5e4671153ed2dcfd9b))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.290.1 ([#192](https://github.com/grafana/grafana-cube-datasource/issues/192)) ([80a5691](https://github.com/grafana/grafana-cube-datasource/commit/80a56917b6cad3f7ba6a0ebe2ab4087f70b4b173))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.291.0 ([#258](https://github.com/grafana/grafana-cube-datasource/issues/258)) ([b773b31](https://github.com/grafana/grafana-cube-datasource/commit/b773b317496f2f22d829b1eec308f805dc27afd6))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.292.0 ([#291](https://github.com/grafana/grafana-cube-datasource/issues/291)) ([0c88f71](https://github.com/grafana/grafana-cube-datasource/commit/0c88f71e751bed3ae12e74a179de374f38114d2d))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.292.1 ([#376](https://github.com/grafana/grafana-cube-datasource/issues/376)) ([77902b6](https://github.com/grafana/grafana-cube-datasource/commit/77902b6c537558455ad2fc9e3559086c203fa61b))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.294.0 ([#435](https://github.com/grafana/grafana-cube-datasource/issues/435)) ([dac5152](https://github.com/grafana/grafana-cube-datasource/commit/dac51520281e727645d959754767d0598db09580))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.295.0 ([#529](https://github.com/grafana/grafana-cube-datasource/issues/529)) ([a5adc40](https://github.com/grafana/grafana-cube-datasource/commit/a5adc40a6d4322f127e3411b9f4cf5725b2825bd))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.296.1 ([#553](https://github.com/grafana/grafana-cube-datasource/issues/553)) ([16b91b2](https://github.com/grafana/grafana-cube-datasource/commit/16b91b2f01d0c95efa5b63067f1a687b492bb7ed))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.296.2 ([#562](https://github.com/grafana/grafana-cube-datasource/issues/562)) ([b02c264](https://github.com/grafana/grafana-cube-datasource/commit/b02c2642e4eaaf085f660b3a69b5ecd44e9b0c30))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.296.3 ([#590](https://github.com/grafana/grafana-cube-datasource/issues/590)) ([c308461](https://github.com/grafana/grafana-cube-datasource/commit/c3084613b779cb4bbf04c83871b4ca376ee349ea))
* **deps:** update postcss to patched 8.5.18+ (GHSA-r28c-9q8g-f849) ([#452](https://github.com/grafana/grafana-cube-datasource/issues/452)) ([40afaa8](https://github.com/grafana/grafana-cube-datasource/commit/40afaa8decf8d423124bf6034ffd53c10bbc72cf))
* **deps:** update tanstack-query monorepo to v5.101.2 ([#415](https://github.com/grafana/grafana-cube-datasource/issues/415)) ([c3ec237](https://github.com/grafana/grafana-cube-datasource/commit/c3ec2377e2e8441d9365777e07c57f5a58ed559a))
* **deps:** update tanstack-query monorepo to v5.101.3 ([#437](https://github.com/grafana/grafana-cube-datasource/issues/437)) ([1af9098](https://github.com/grafana/grafana-cube-datasource/commit/1af90988b9bd945378247926c38137387c07efc8))
* **deps:** update tanstack-query monorepo to v5.101.4 ([#449](https://github.com/grafana/grafana-cube-datasource/issues/449)) ([e08f2ee](https://github.com/grafana/grafana-cube-datasource/commit/e08f2eebdc932141e35191a907506cee1b0625e6))
* fall back to POST /v1/load for large queries ([#379](https://github.com/grafana/grafana-cube-datasource/issues/379)) ([7edf7cf](https://github.com/grafana/grafana-cube-datasource/commit/7edf7cf8bcbd02c46bd7c0697f7c35b8771bea89))
* handle Cube "Continue wait" polling protocol ([#114](https://github.com/grafana/grafana-cube-datasource/issues/114)) ([6bb796b](https://github.com/grafana/grafana-cube-datasource/commit/6bb796b103f2bed987fffa687d764b09a64b7c12))
* **plugin:** make grafanaDependency prerelease-inclusive ([#362](https://github.com/grafana/grafana-cube-datasource/issues/362)) ([4348ec4](https://github.com/grafana/grafana-cube-datasource/commit/4348ec482d17434df65fdfc84175eff71f155645)), closes [#357](https://github.com/grafana/grafana-cube-datasource/issues/357)
* preserve limit zero and detect legacy template vars ([#143](https://github.com/grafana/grafana-cube-datasource/issues/143)) ([a110a57](https://github.com/grafana/grafana-cube-datasource/commit/a110a571758a64956c09589f7aa3a29a8f6d2a14))
* **query-builder:** scope filter values by preceding + adhoc filters ([#32](https://github.com/grafana/grafana-cube-datasource/issues/32)) ([#453](https://github.com/grafana/grafana-cube-datasource/issues/453)) ([97bacaf](https://github.com/grafana/grafana-cube-datasource/commit/97bacaf9fdf56c77b23ade5fbc48cecf8117d302))
* read URL from ds.url instead of ds.jsonData.cubeApiUrl in E2E test ([1c5fed2](https://github.com/grafana/grafana-cube-datasource/commit/1c5fed24f460cef0da98ca6d6c84ca1d093a2ab1))
* **security/medium/:** update dependency qs to v6.15.2 [security] ([#344](https://github.com/grafana/grafana-cube-datasource/issues/344)) ([2794b20](https://github.com/grafana/grafana-cube-datasource/commit/2794b2071534dd0677febf8bc63d247baadb2269))
* **security/unknown/:** update module golang.org/x/net to v0.55.0 [security] ([#345](https://github.com/grafana/grafana-cube-datasource/issues/345)) ([a1a168d](https://github.com/grafana/grafana-cube-datasource/commit/a1a168de10b0c6403320a8725c33a708365e7a40))
* **security/unknown/:** update module golang.org/x/net to v0.56.0 [security] ([#401](https://github.com/grafana/grafana-cube-datasource/issues/401)) ([e52d176](https://github.com/grafana/grafana-cube-datasource/commit/e52d176a51b39a32b5ec3252fa8aaed08d0c6b64))
* **security/unknown/:** update module golang.org/x/text to v0.39.0 [security] ([#402](https://github.com/grafana/grafana-cube-datasource/issues/402)) ([a4df655](https://github.com/grafana/grafana-cube-datasource/commit/a4df6559d2a5045b342e90b3c727e880e1e587f3))
* **security:** override ws to 8.21.0 (CVE-2026-48779) ([#360](https://github.com/grafana/grafana-cube-datasource/issues/360)) ([9a3dbbc](https://github.com/grafana/grafana-cube-datasource/commit/9a3dbbc86d2912720e4cf1b9a2fa5d0b7ffd2898))
* support Grafana &gt;=12.2.5 with 12.3.3 dev default ([#130](https://github.com/grafana/grafana-cube-datasource/issues/130)) ([e4bf264](https://github.com/grafana/grafana-cube-datasource/commit/e4bf264703a44d2a35820f3fa187a8618558022c))
* **time:** intersect per-panel timeDimensions with dashboard time range ([#173](https://github.com/grafana/grafana-cube-datasource/issues/173)) ([#457](https://github.com/grafana/grafana-cube-datasource/issues/457)) ([1cbc618](https://github.com/grafana/grafana-cube-datasource/commit/1cbc618c335a0ea80de30f5d94024e111276495a))
* treat scenes' all-value sentinel (=| $__all) as a no-op ([#587](https://github.com/grafana/grafana-cube-datasource/issues/587)) ([b725b1d](https://github.com/grafana/grafana-cube-datasource/commit/b725b1d2285232a6564d24af725f1b1c508f2f0c))
* treat scenes' match-all filter (=~ .*) as no-op instead of equals '.*' ([#531](https://github.com/grafana/grafana-cube-datasource/issues/531)) ([d4d3996](https://github.com/grafana/grafana-cube-datasource/commit/d4d39966312519c7deb2bae5573b97eefe2bb89b))
* **ui:** refresh SQL preview when dashboard variables change ([6559ea5](https://github.com/grafana/grafana-cube-datasource/commit/6559ea5408e26944f0a83e5e6c8623bdafc2968d))
* **ui:** refresh SQL preview when dashboard variables change ([fb5fc22](https://github.com/grafana/grafana-cube-datasource/commit/fb5fc2253911042db607ef0c515b4fda56f33184))
* unbreak CI after re-enabling Actions (lockfile drift + node 24) ([#349](https://github.com/grafana/grafana-cube-datasource/issues/349)) ([ee206db](https://github.com/grafana/grafana-cube-datasource/commit/ee206db7577dc3c7576bdce9d8519f52f6507d8e))

## [0.6.6](https://github.com/grafana/grafana-cube-datasource/compare/v0.6.5...v0.6.6) (2026-10-20)

### Miscellaneous Chores

* pin golangci-lint to 2.15.0 in development dependencies and CI/CD pipelines

## [0.6.5](https://github.com/grafana/grafana-cube-datasource/compare/v0.6.4...v0.6.5) (2026-08-21)


### Bug Fixes

* treat scenes' all-value sentinel (=| $__all) as a no-op ([#587](https://github.com/grafana/grafana-cube-datasource/issues/587)) ([b725b1d](https://github.com/grafana/grafana-cube-datasource/commit/b725b1d2285232a6564d24af725f1b1c508f2f0c))

## [0.6.4](https://github.com/grafana/grafana-cube-datasource/compare/v0.6.3...v0.6.4) (2026-08-21)


### Bug Fixes

* **adhoc:** drop AdHoc filters inapplicable to a query's Cube view ([#307](https://github.com/grafana/grafana-cube-datasource/issues/307)) ([#495](https://github.com/grafana/grafana-cube-datasource/issues/495)) ([dc4130d](https://github.com/grafana/grafana-cube-datasource/commit/dc4130dabc5e453d10d521f0f618966f6868d20c))
* **adhoc:** partition getTagValues scoping filters + time dimension by view ([#498](https://github.com/grafana/grafana-cube-datasource/issues/498)) ([#499](https://github.com/grafana/grafana-cube-datasource/issues/499)) ([fe0ba7e](https://github.com/grafana/grafana-cube-datasource/commit/fe0ba7ec854062073952b9c1e26cac985ede27d6))
* **adhoc:** treat scenes' match-all filter (`=~ .*`) as no-op instead of equals `'.*'` ([#531](https://github.com/grafana/grafana-cube-datasource/issues/531)) ([d4d3996](https://github.com/grafana/grafana-cube-datasource/commit/d4d39966312519c7deb2bae5573b97eefe2bb89b))
* **adhoc:** wire AdHoc filters via request.filters ([#127](https://github.com/grafana/grafana-cube-datasource/issues/127)) + [#307](https://github.com/grafana/grafana-cube-datasource/issues/307) demo ([#507](https://github.com/grafana/grafana-cube-datasource/issues/507)) ([c45b7f3](https://github.com/grafana/grafana-cube-datasource/commit/c45b7f3ec01ff333e999e4e994792b6e42928dbb))
* **deps:** apply js-yaml override to @istanbuljs/load-nyc-config ([#563](https://github.com/grafana/grafana-cube-datasource/issues/563)) ([7ca859c](https://github.com/grafana/grafana-cube-datasource/commit/7ca859cd9ded3f4634fade18c016312484824fa4))
* **deps:** bump fast-uri to 3.1.5 to fix CVE-2026-18446 ([#535](https://github.com/grafana/grafana-cube-datasource/issues/535)) ([62151c5](https://github.com/grafana/grafana-cube-datasource/commit/62151c54dd68cf870f1633e81a494a0e570584a5))
* **deps:** update dependency @grafana/plugin-ui to v0.17.4 ([#577](https://github.com/grafana/grafana-cube-datasource/issues/577)) ([7aa0888](https://github.com/grafana/grafana-cube-datasource/commit/7aa08880a6cb6f12736335ff6e655e216e2278c3))
* **deps:** update grafana monorepo to v13.1.2 ([#544](https://github.com/grafana/grafana-cube-datasource/issues/544)) ([f53ba8f](https://github.com/grafana/grafana-cube-datasource/commit/f53ba8f4e87f5320b23aa4c56cfa37ae7975079e))
* **deps:** update grafana monorepo to v13.1.3 ([#556](https://github.com/grafana/grafana-cube-datasource/issues/556)) ([8aedab8](https://github.com/grafana/grafana-cube-datasource/commit/8aedab8d9323f25cef7db8d4896271c29d0ff7cf))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.295.0 ([#529](https://github.com/grafana/grafana-cube-datasource/issues/529)) ([a5adc40](https://github.com/grafana/grafana-cube-datasource/commit/a5adc40a6d4322f127e3411b9f4cf5725b2825bd))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.296.1 ([#553](https://github.com/grafana/grafana-cube-datasource/issues/553)) ([16b91b2](https://github.com/grafana/grafana-cube-datasource/commit/16b91b2f01d0c95efa5b63067f1a687b492bb7ed))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.296.2 ([#562](https://github.com/grafana/grafana-cube-datasource/issues/562)) ([b02c264](https://github.com/grafana/grafana-cube-datasource/commit/b02c2642e4eaaf085f660b3a69b5ecd44e9b0c30))

## [0.6.3](https://github.com/grafana/grafana-cube-datasource/compare/v0.6.2...v0.6.3) (2026-07-27)


### Features

* **format:** support Cube measure format → Grafana units ([#246](https://github.com/grafana/grafana-cube-datasource/issues/246)) ([#459](https://github.com/grafana/grafana-cube-datasource/issues/459)) ([2185fde](https://github.com/grafana/grafana-cube-datasource/commit/2185fde38ecc7c616f3003165525c30ab004c10a))


### Bug Fixes

* **adhoc:** scope filter values by dashboard time range ($cubeTimeDimension) ([#35](https://github.com/grafana/grafana-cube-datasource/issues/35)) ([#454](https://github.com/grafana/grafana-cube-datasource/issues/454)) ([84a3613](https://github.com/grafana/grafana-cube-datasource/commit/84a3613b58aeaa3366a402f175e177bb6743f423))
* **backend:** preserve upstream /v1/load status + transient retry & transport classification ([#118](https://github.com/grafana/grafana-cube-datasource/issues/118)) ([#431](https://github.com/grafana/grafana-cube-datasource/issues/431)) ([c51844b](https://github.com/grafana/grafana-cube-datasource/commit/c51844b7620d3315e500379b80449a83b19e19f2))
* **deps:** force brace-expansion 5.0.8 via minimatch 10 override (GHSA-mh99-v99m-4gvg) ([#476](https://github.com/grafana/grafana-cube-datasource/issues/476)) ([f52495c](https://github.com/grafana/grafana-cube-datasource/commit/f52495cc4b60e1fcac22f5b874add6b7fa285137))
* **deps:** update dependency @grafana/plugin-ui to v0.17.1 ([#413](https://github.com/grafana/grafana-cube-datasource/issues/413)) ([5529e5d](https://github.com/grafana/grafana-cube-datasource/commit/5529e5dd56d98cc3c6b7b2e91e4b9554372f69ab))
* **deps:** update dependency @grafana/plugin-ui to v0.17.2 ([#451](https://github.com/grafana/grafana-cube-datasource/issues/451)) ([971cf18](https://github.com/grafana/grafana-cube-datasource/commit/971cf18b16e9101484f1deece99754c394dc5b71))
* **deps:** update dependency @grafana/plugin-ui to v0.17.3 ([#456](https://github.com/grafana/grafana-cube-datasource/issues/456)) ([1283a59](https://github.com/grafana/grafana-cube-datasource/commit/1283a59d62769e9ea97cc226fce56591ab74bd2c))
* **deps:** update fast-uri to 3.1.4 (CVE-2026-16221) ([#410](https://github.com/grafana/grafana-cube-datasource/issues/410)) ([1052d46](https://github.com/grafana/grafana-cube-datasource/commit/1052d46ba9b4c45af534de6299c93e0d13c373a7))
* **deps:** update fast-uri to patched 3.1.3 (CVE-2026-13676) ([#406](https://github.com/grafana/grafana-cube-datasource/issues/406)) ([6bdb84c](https://github.com/grafana/grafana-cube-datasource/commit/6bdb84cc4f5eabb17f3aff9be7bfdcd8f8361ca5))
* **deps:** update grafana monorepo to v13.1.0 ([#414](https://github.com/grafana/grafana-cube-datasource/issues/414)) ([ab8e5ec](https://github.com/grafana/grafana-cube-datasource/commit/ab8e5ecbc4a877dabf87261a110cb9543c30558f))
* **deps:** update grafana monorepo to v13.1.1 ([#448](https://github.com/grafana/grafana-cube-datasource/issues/448)) ([47230b9](https://github.com/grafana/grafana-cube-datasource/commit/47230b92706d77cb054701e2c901357167b248e7))
* **deps:** update js-yaml to patched 4.3.0/3.15.0 (CVE-2026-59869) ([#383](https://github.com/grafana/grafana-cube-datasource/issues/383)) ([a792b10](https://github.com/grafana/grafana-cube-datasource/commit/a792b10aedc0d26567897d0190f6ec0420a7777d))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.292.1 ([#376](https://github.com/grafana/grafana-cube-datasource/issues/376)) ([77902b6](https://github.com/grafana/grafana-cube-datasource/commit/77902b6c537558455ad2fc9e3559086c203fa61b))
* **deps:** update module github.com/grafana/grafana-plugin-sdk-go to v0.294.0 ([#435](https://github.com/grafana/grafana-cube-datasource/issues/435)) ([dac5152](https://github.com/grafana/grafana-cube-datasource/commit/dac51520281e727645d959754767d0598db09580))
* **deps:** update postcss to patched 8.5.18+ (GHSA-r28c-9q8g-f849) ([#452](https://github.com/grafana/grafana-cube-datasource/issues/452)) ([40afaa8](https://github.com/grafana/grafana-cube-datasource/commit/40afaa8decf8d423124bf6034ffd53c10bbc72cf))
* **deps:** update tanstack-query monorepo to v5.101.2 ([#415](https://github.com/grafana/grafana-cube-datasource/issues/415)) ([c3ec237](https://github.com/grafana/grafana-cube-datasource/commit/c3ec2377e2e8441d9365777e07c57f5a58ed559a))
* **deps:** update tanstack-query monorepo to v5.101.3 ([#437](https://github.com/grafana/grafana-cube-datasource/issues/437)) ([1af9098](https://github.com/grafana/grafana-cube-datasource/commit/1af90988b9bd945378247926c38137387c07efc8))
* **deps:** update tanstack-query monorepo to v5.101.4 ([#449](https://github.com/grafana/grafana-cube-datasource/issues/449)) ([e08f2ee](https://github.com/grafana/grafana-cube-datasource/commit/e08f2eebdc932141e35191a907506cee1b0625e6))
* fall back to POST /v1/load for large queries ([#379](https://github.com/grafana/grafana-cube-datasource/issues/379)) ([7edf7cf](https://github.com/grafana/grafana-cube-datasource/commit/7edf7cf8bcbd02c46bd7c0697f7c35b8771bea89))
* **plugin:** make grafanaDependency prerelease-inclusive ([#362](https://github.com/grafana/grafana-cube-datasource/issues/362)) ([4348ec4](https://github.com/grafana/grafana-cube-datasource/commit/4348ec482d17434df65fdfc84175eff71f155645)), closes [#357](https://github.com/grafana/grafana-cube-datasource/issues/357)
* **query-builder:** scope filter values by preceding + adhoc filters ([#32](https://github.com/grafana/grafana-cube-datasource/issues/32)) ([#453](https://github.com/grafana/grafana-cube-datasource/issues/453)) ([97bacaf](https://github.com/grafana/grafana-cube-datasource/commit/97bacaf9fdf56c77b23ade5fbc48cecf8117d302))
* **security/unknown/:** update module golang.org/x/net to v0.56.0 [security] ([#401](https://github.com/grafana/grafana-cube-datasource/issues/401)) ([e52d176](https://github.com/grafana/grafana-cube-datasource/commit/e52d176a51b39a32b5ec3252fa8aaed08d0c6b64))
* **security/unknown/:** update module golang.org/x/text to v0.39.0 [security] ([#402](https://github.com/grafana/grafana-cube-datasource/issues/402)) ([a4df655](https://github.com/grafana/grafana-cube-datasource/commit/a4df6559d2a5045b342e90b3c727e880e1e587f3))
* **time:** intersect per-panel timeDimensions with dashboard time range ([#173](https://github.com/grafana/grafana-cube-datasource/issues/173)) ([#457](https://github.com/grafana/grafana-cube-datasource/issues/457)) ([1cbc618](https://github.com/grafana/grafana-cube-datasource/commit/1cbc618c335a0ea80de30f5d94024e111276495a))

## [0.6.2](https://github.com/grafana/grafana-cube-datasource/compare/v0.6.1...v0.6.2) (2026-06-03)


### Bug Fixes

* unbreak CI after re-enabling Actions (lockfile drift + node 24) ([#349](https://github.com/grafana/grafana-cube-datasource/issues/349)) ([ee206db](https://github.com/grafana/grafana-cube-datasource/commit/ee206db7577dc3c7576bdce9d8519f52f6507d8e))

## [0.6.1](https://github.com/grafana/grafana-cube-datasource/compare/v0.6.0...v0.6.1) (2026-05-07)


### Bug Fixes

* **deps:** update all non-major dependencies ([#322](https://github.com/grafana/grafana-cube-datasource/issues/322)) ([7833059](https://github.com/grafana/grafana-cube-datasource/commit/78330595e43f4bf1210e00ef2f87c2047b920d66))

## [0.6.0](https://github.com/grafana/grafana-cube-datasource/compare/v0.5.0...v0.6.0) (2026-05-06)


### ⚠ BREAKING CHANGES

* remove legacy order object format and cubeApiUrl jsonData field ([#318](https://github.com/grafana/grafana-cube-datasource/issues/318))

### Features

* remove legacy order object format and cubeApiUrl jsonData field ([#318](https://github.com/grafana/grafana-cube-datasource/issues/318)) ([0e02222](https://github.com/grafana/grafana-cube-datasource/commit/0e02222a37ad75f5e1f5718aba3e66ecd1cbe40e))


### Bug Fixes

* **deps:** update all non-major dependencies ([#311](https://github.com/grafana/grafana-cube-datasource/issues/311)) ([906040c](https://github.com/grafana/grafana-cube-datasource/commit/906040c375e6b4455d71f9623208ee7a730842dd))
* **deps:** update all non-major dependencies to v5.100.6 ([#308](https://github.com/grafana/grafana-cube-datasource/issues/308)) ([ea15a8a](https://github.com/grafana/grafana-cube-datasource/commit/ea15a8a9dc3f012d26119fa6567e988e36945b1e))
* **deps:** update grafana monorepo to v13 ([#284](https://github.com/grafana/grafana-cube-datasource/issues/284)) ([35f1614](https://github.com/grafana/grafana-cube-datasource/commit/35f16141edd3e20cc278a3201781cff1d38b7e9a))
* **deps:** update grafana monorepo to v13 ([#317](https://github.com/grafana/grafana-cube-datasource/issues/317)) ([df018ac](https://github.com/grafana/grafana-cube-datasource/commit/df018ac78c1f02f41882f413002c0d942e0e5d0d))

## 0.5.0 (2026-05-01)

### Features

- **View-scoped visual queries**: The visual query builder now scopes to one Cube view at a time, treating views as the curated public query surface. Fields from other views are disabled with guidance to model cross-view combinations as a new view. The `/metadata` resource now exposes only view members (#304)

**Full Changelog**: [v0.4.0...v0.5.0](https://github.com/grafana/grafana-cube-datasource/compare/v0.4.0...v0.5.0)

## 0.4.0 (2026-03-27)

### Features

- **Measure/dimension descriptions in dropdowns**: Surface Cube field descriptions as subtitle text in the query editor's Dimensions and Measures dropdowns, with search matching against descriptions too (#235)
- **Data Model tab hint after Save & Test**: Always show the Data Model configuration tab hint after a successful connection test, so new users discover model generation immediately (#189)

**Full Changelog**: [v0.3.3...v0.4.0](https://github.com/grafana/grafana-cube-datasource/compare/v0.3.3...v0.4.0)

## 0.3.3 (2026-03-20)

### Bug Fixes

- **Fix release build**: Remove Go source files shipped inside the `flatted` npm package (`golang/pkg/flatted/flatted.go`) via a `postinstall` script, preventing the Grafana plugin validator from rejecting the archive with "Invalid Go manifest file" (#2700)

**Full Changelog**: [v0.3.2...v0.3.3](https://github.com/grafana/grafana-cube-datasource/compare/v0.3.2...v0.3.3)

## 0.3.2 (2026-03-20)

### Security

- **Backend authorization for generate-schema**: The mutating `generate-schema` CallResource route now requires Admin org role, preventing non-admin users from triggering model file generation on the upstream Cube instance (#216)
- **Dependency security fixes**: Update `flatted` to 3.4.2 to resolve CVE-2026-32141 and CVE-2026-33228

### Improved

- **Standard SQL casts**: Replace PostgreSQL-specific `::date` and `::numeric` cast syntax with standard `CAST()` in demo dashboard queries and Cube model, improving compatibility with DuckDB and BigQuery (#204)

**Full Changelog**: [v0.3.0...v0.3.2](https://github.com/grafana/grafana-cube-datasource/compare/v0.3.0...v0.3.2)

## 0.3.0 (2026-03-13)

### Features

- **Standard datasource URL**: Use Grafana's standard `url` field for the Cube API endpoint instead of `jsonData.cubeApiUrl`, with backward-compatible fallback (#177)
- **Generated data model dashboard**: Added a provisioned demo dashboard for the generated data model (#175)
- **Refreshed demo dashboards**: Updated provisioned demo dashboards to reflect current plugin capabilities (#184)

### Bug Fixes

- **Stale SQL preview**: SQL preview now refreshes when dashboard variables change (#150)

### Deprecated

- **`jsonData.cubeApiUrl` provisioning field**: The URL should now be set using
  Grafana's standard top-level `url` field. The legacy `jsonData.cubeApiUrl`
  field continues to work as a fallback but will be removed in a future release.

  Migrate provisioning configs:
  ```diff
    datasources:
      - name: Cube
        type: grafana-cube-datasource
  +     url: http://localhost:4000
        jsonData:
  -       cubeApiUrl: http://localhost:4000
  +       # cubeApiUrl is no longer needed for the URL
  ```

**Full Changelog**: [v0.2.0...v0.3.0](https://github.com/grafana/grafana-cube-datasource/compare/v0.2.0...v0.3.0)

## 0.2.0 (2026-02-18)

### Features

- **Data Model config page**: Full config page for generating Cube data model YAML files from connected database schemas (#132)
- **JSON query viewer**: When a query contains features the visual editor cannot represent (e.g. time dimensions), the query editor switches to a read-only JSON viewer with syntax highlighting and a compiled SQL preview (#136)
- **All Cube filter operators**: Support all Cube filter operators (`contains`, `gt`, `gte`, `lt`, `lte`, `set`, `notSet`, `inDateRange`, and more) and measure filters via panel JSON (#138)
- **AND/OR filter groups**: Support logical AND/OR filter groups for complex conditions via panel JSON (#139)
- **Template variable detection in filters**: Filter values containing template variables automatically trigger the JSON viewer to avoid corrupting the variable syntax (#140)
- **No-cubes guidance**: When no cubes are detected, the query editor guides users to the Data Model configuration tab (#148)

### Bug Fixes

- **Preserve limit zero and legacy template vars**: Correctly handle `limit: 0` (unlimited) and detect legacy `$variable` template variable syntax (#143)

**Full Changelog**: [v0.1.4...v0.2.0](https://github.com/grafana/grafana-cube-datasource/compare/v0.1.4...v0.2.0)

## 0.1.4 (2026-02-13)

### Changed in 0.1.4

- Set minimum supported Grafana version to `12.2.5` based on patched Grafana plugin backward-compatibility support for jsx-runtime externalization.
- Drop support for Grafana versions earlier than `12.2.5`.
- Use `12.3.3` as the default local development target while keeping `12.2.5` as the minimum supported version.

## 0.1.3 (2026-02-12)

### Fixed in 0.1.3

- Externalize `react/jsx-runtime` and `react/jsx-dev-runtime` to keep frontend bundle behavior compatible with React 19
- Remove invalid alerting receiver from local provisioning to unblock React 19 preview startup during validation

### Changed in 0.1.3

- Upgrade shared `plugin-ci-workflows` to `v6.0.0` so React 19 preview checks are included in CI by default

## 0.1.2 (2026-02-12)

### Fixed in 0.1.2

- Handle Cube "Continue wait" polling protocol correctly for long-running queries
- Update non-major dependencies, including security-related updates

### Changed in 0.1.2

- Simplify backend test interaction patterns for better maintainability

### Documentation in 0.1.2

- Add Cube SDK parity guidance for backend protocol behavior

## 0.1.1 (2026-01-28)

### Fixed

- Compressed query editor screenshot to resolve webpack asset size warning
- Updated release workflow to use Node 24, matching `package.json` engine requirements

## 0.1.0 (2026-01-27)

Initial public release.

### Features

- **Query Builder**: Visual interface for building Cube queries with dimensions, measures, and filters
- **Order By**: Configurable sorting for query results
- **SQL Preview**: View the generated SQL before executing queries
- **Multi-value Filters**: Filter operators support multiple values with intuitive multi-select UI
- **Time-series Support**: Compatible with Grafana time-series panels and time range filtering
- **AdHoc Filters**: Support for Grafana's ad-hoc filter variables

### Notes

This is an experimental data source plugin. Breaking changes may occur in minor version updates until v1.0.0.
