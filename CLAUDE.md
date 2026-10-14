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
- Ndryshimi manual i gjendjes krijon lëvizje "rregullim manual" me diferencën, përdoruesin dhe arsyen (vetëm Admin/Financë).
- Asnjë fshirje fizike e dokumenteve financiare – vetëm anulim me arsye. Çdo veprim shkruhet te `auditLog`.
- Lejet e roleve (Admin, Shitës, Financë, Magazinier) zbatohen në **Firestore Security Rules**, jo vetëm në UI. Shitësi nuk sheh kosto/fitim.
- Asnjë localStorage për të dhëna biznesi. Listat e mëdha me pagination.
- Logjika e biznesit në `services/`, jo brenda komponentëve UI.

## Struktura (Faza 1)
- Rolet: `admin`, `shites`, `finance`, `magazinier` → `src/config/roles.js` (UI) dhe `firestore.rules` (server). Mbaji të sinkronizuara.
- Admini i parë krijohet një herë përmes shënuesit `meta/bootstrap`; rules ndalojnë çdo vetë-ngritje në Admin.
- Çdo shkrim + hyrja e `auditLog` në të njëjtin batch/transaction (`services/auditService.js`).
- Repo në GitHub: `intal-crm` (`base: '/intal-crm/'`). Repo-ja `intal-pro` është sistemi i vjetër – mos e prek.

## Siguria e repo-s
`data/`, `firebase-config*.txt`, `.env` nuk shkojnë kurrë në git. Konfigurimi i Firebase vjen nga `VITE_FIREBASE_*` (lokalisht `.env`, në CI GitHub Secrets).

## Mënyra e punës
Puno me faza (shih SPEC.md → "Mënyra e punës") dhe ndalo pas secilës për testim. Mos bëj push në GitHub pa pyetur.
