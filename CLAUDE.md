# INTAL PRO – udhëzime për Claude

Specifikimi i plotë: [SPEC.md](SPEC.md). Lexoje para çdo faze; ky skedar përmbledh vetëm rregullat që nuk shkelen kurrë.

## Stack
React + Vite, HashRouter, Firebase (vetëm Auth email/fjalëkalim + Firestore). Hosting në GitHub Pages me deploy automatik nga `main`.

## Rregulla kryesore
- **Ndërfaqja tërësisht në shqip** (tekste, mesazhe gabimi, emra rubrikash).
- **Paratë si numra të plotë** në njësinë më të vogël (qindarka/cent): 990.90 EUR → `99090`. Asnjëherë float për shuma. Konvertimi në/nga tekst vetëm në shtresën e shfaqjes.
  Vlen për të gjitha monedhat, edhe LEK (×100). Kurset ruhen si numra të plotë ×10000 (`RATE_SCALE`). Gjithçka kalon nga `src/utils/money.js`.
- Çdo dokument (faturë, hyrje, pagesë) ruan monedhën dhe kursin ndaj LEK të ngrirë në momentin e krijimit.
- **Numrat e faturave janë unikë pa përjashtim**, të njëpasnjëshëm, gjeneruar me Firestore transaction mbi `counters`, me kontroll që numri nuk ekziston.
- **Transaction i vetëm** për lëshimin e faturës: numri + ulja e stokut + kartela e klientit + auditLog. Po ashtu për anulimin (rillogaritja e zinxhirit).
- **Bartja e gjendjes**: borxhi bartet gjithmonë te fatura më e re e klientit (për monedhë). Gjendja e mëparshme = gjendja e re e faturës së fundit; gjendja e re = e mëparshme + totali − paguar. Pagesat pa faturë zbriten nga fatura e fundit.
- **Statuset nxirren automatikisht**, nuk zgjidhen me dorë:
  - **E paguar** – gjendja e re ≤ 0;
  - **Pa paguar** – fatura më e fundit e klientit me gjendje > 0;
  - **Pasuar** – gjendja > 0 u bart te një faturë më e re;
  - **Anuluar**. Kur fatura që mban borxhin bëhet "E paguar", "Pasuar"-at para saj kalojnë në "E paguar".
- Ndryshimi manual i gjendjes krijon lëvizje "rregullim manual" me diferencën, përdoruesin dhe arsyen (vetëm me lejen `rregullim_gjendjeje`).
- Asnjë fshirje fizike e dokumenteve financiare – vetëm anulim me arsye. Çdo veprim shkruhet te `auditLog`.
- **Lejet janë për çdo përdorues**: Admini i zgjedh kur krijon përdoruesin (nga shabllonet Shitës / Financë / Magazinier / I personalizuar) dhe mund t'i ndryshojë më vonë. Zbatohen në **Firestore Security Rules**, jo vetëm në UI. Kosto/fitimi vetëm me lejen `sheh_koston`.
- Asnjë localStorage për të dhëna biznesi. Listat e mëdha me pagination.
- Logjika e biznesit në `services/`, jo brenda komponentëve UI.

## Struktura (Faza 1)
- Lejet: `src/config/permissions.js` (çelësat + shabllonet) ↔ `firestore.rules` (`can()`, `roleDefaults`). Mbaji të sinkronizuara. Në UI përdor `perms` nga `useAuth()` (Set), kurrë `role` për akses. Çdo modul i ri shton lejet e veta te të dyja vendet.
- Admini i parë krijohet një herë përmes shënuesit `meta/bootstrap`; rules ndalojnë çdo vetë-ngritje në Admin.
- Çdo shkrim + hyrja e `auditLog` në të njëjtin batch/transaction (`services/auditService.js`).

## Struktura (Faza 2)
- Kartela: `ledger` (vetëm shtim, `shuma` me shenjë: + rrit borxhin). `clients.gjendje.{MONEDHA}` përditësohet në të njëjtin transaction dhe vendos `lastLedgerId`; rules verifikojnë ndryshimi = shuma. Njësoj pikët (`loyaltyPoints`, `piket`, `lastPointsId`).
- Llojet e lëvizjeve dhe lejet: `src/config/ledger.js` ↔ `validLedger` te rules.
- Kosto e artikullit në `itemCosts/{id}` (jo te `items`), që Shitësi të mos e lexojë. Kodi unik përmes `itemCodes/{KODI}`.
- Çmime preferenciale: `preferentialPrices/{itemId}_{clientId}`. "Klient Rastësor" = `clients/klient-rastesor`.

## Struktura (Faza 3)
- Fatura: `invoices` (draft pa numër → lëshim në një transaction te `services/invoiceService.js`). Numri unik: `invoiceNumbers/{numri}` + `counters/invoices`.
- Zinxhiri: `clients.faturaFundit.{MONEDHA}` = fatura që mban borxhin; `invoices.mbetur` ndryshon me çdo lëvizje kartele; logjika e statuseve dhe pikëve te `services/invoiceChain.js` (përdoret nga lëshimi, pagesat dhe anulimi). Fushat e printuara (gjendjaPara/paguar/gjendjaRe) nuk ndryshojnë kurrë. Përjashtim i vetëm: `unmarkPaid` (heqja e shenjës "E paguar" te fatura e FUNDIT e klientit) vendos paguar = 0 dhe gjendjaRe = gjendjaPara + totali, me lëvizjen `anulim_pagese` në kartelë/arkë (pagesat e vjetra nuk fshihen; ruhen te `pagesatAnuluara`).
- Klienti mund të marrë 1–3 lëvizje kartele në një transaction (`lastLedgerIds`); rules verifikojnë shumën.
- `invoiceLines` (statistikat e klientit/artikullit), `stockMovements` (dalje/kthim_anulim), `costHistory` (fitimi me koston në datën e faturës).

## Struktura (Faza 4)
- Stoku: burimi = `stockMovements` (vetëm shtim; dalje/kthim_anulim/hyrje/anulim_hyrje/rregullim). `stock/{itemId}.sasia` = kopje me `increment()` në të njëjtin transaction (`services/stockService.writeMovement`, një lëvizje për artikull për dokument). Admini e rindërton me "Rillogarit stokun". Rules nuk e verifikojnë kopjen (limiti 20 akses/transaction).
- Hyrjet: `purchases` + `purchaseNumbers/{numri}` + `counters/purchases` (`services/purchaseService.js`). Kosto nga hyrja → `itemCosts` + `costHistory` me `burim`.
- Detyrimi ndaj furnitorit veçmas nga kartela e klientit: `clients.detyrimFurnitori.{MONEDHA}` + `supplierLedger` (`lastSupplierLedgerId`).

## Struktura (Faza 5)
- Paratë: `cashMovements` (vetëm shtim; arketim/kthim_klientit/pagese_furnitori/shpenzim/anulim/transferte/gjendje_fillestare/rregullim) shkruhen me `services/cashService.writeCash` në të njëjtin transaction me burimin (pagesa e klientit te `ledgerService`/`invoiceService`). `cashBalances/main.{arke|banke}.{MONEDHA}` = kopje me increment.
- `expenses` dhe `supplierPayments` nuk fshihen: anulohen me arsye (lëvizja e kundërt në arkë). Pagesa e furnitorit ul `detyrimFurnitori` përmes `supplierLedger`.
- Anulimi i faturës me pagesë: `kthePagesen` → paratë dalin nga arka; përndryshe klienti mbetet me tepricë.
- Raportet (`pages/reports`) lexojnë `invoiceLines` sipas periudhës; borxhet sipas vjetërsisë ndajnë borxhin aktual nga fatura më e re drejt së vjetrës.

## Struktura (Faza 6)
- Importi: `services/importService.js` → `buildImportPlan` (lista e rregullt shkrimesh me ID deterministe nga id-të e vjetra + raporti) dhe `runImport` (batch 450; progresi te `companies/{c}/meta/import` në të njëjtin batch → vazhdon pas kuotës ditore pa dublikata).
- Rules: "mënyra e importit" (`meta/import.aktiv`, vetëm Admin) lejon shkrimin e dokumenteve historike; mbyllet pas importit.
- Projekti i provës: `.env.test` (VITE_* e projektit test) + `npm run dev:test`; Rules publikohen me `--project <id-test>`.
- Rules dhe indekset publikohen me `npx firebase-tools deploy --only firestore` (pyet para çdo deploy-i).
- Repo në GitHub: `intal-crm` (`base: '/intal-crm/'`). Repo-ja `intal-pro` është sistemi i vjetër – mos e prek.

## Paneli (lexime të pakta)
- `services/dashboardService.js`: borxhi/detyrimet me sum/count nga serveri; statistikat e rënda (grafiku, top artikujt, vlera e stokut, fitimi) te `stats/paneli` + `stats/paneliKosto` (vetëm `sheh_koston`), rillogaritur pas 6 orësh ose me "Rifresko".
- `snapshots/{YYYY-MM}`: stoku dhe borxhi në fund të muajit, krijohet një herë (rules: vetëm create). Mos shto listener-a mbi koleksione të plota te Paneli.
- Agregimet: një kërkesë për çdo fushë (`aggregate()` te invoiceService) – Firestore kërkon indeks për çdo kombinim fushash të mbledhura.

## Siguria e repo-s
`data/`, `firebase-config*.txt`, `.env` nuk shkojnë kurrë në git. Konfigurimi i Firebase vjen nga `VITE_FIREBASE_*` (lokalisht `.env`, në CI GitHub Secrets).

## Mënyra e punës
Puno me faza (shih SPEC.md → "Mënyra e punës") dhe ndalo pas secilës për testim. Mos bëj push në GitHub pa pyetur.
