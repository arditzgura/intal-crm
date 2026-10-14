# INTAL PRO – CRM & Faturim (React + Firebase)

## Qëllimi
Ndërto një sistem CRM tërësisht online për INTAL ALBANIA (prodhim të brendshmesh
dhe veshjesh), për përdorim të brendshëm. Funksioni kryesor është gjenerimi i
faturave. Çdo modul tjetër ushqehet nga faturat dhe hyrjet e mallit. Ndërfaqja
është në shqip. Nuk ka fiskalizim dhe nuk ka TVSH.

Sistemi zëvendëson një aplikacion ekzistues që punonte me localStorage. Të dhënat
e vjetra (≈2,900 fatura, 170 klientë, 151 artikuj, 93 hyrje malli) importohen
nga një skedar backup .json (shih "Importi").

## Teknologjia
- React + Vite, React Router (HashRouter), Firebase SDK (modular).
- Hosting: GitHub Pages. Firebase përdoret vetëm për të dhënat dhe login-in,
  jo për hosting.
  - `base` te vite.config sipas emrit të repo-s (p.sh. `/intal-pro/`).
  - HashRouter, që faqet të hapen direkt edhe pas rifreskimit në GitHub Pages.
  - GitHub Actions workflow që ndërton dhe publikon automatikisht me çdo push
    te `main`.
  - Domeni `<llogaria>.github.io` duhet shtuar te Firebase Authentication →
    Authorized domains.
- Firebase: vetëm Authentication (email + fjalëkalim) dhe Firestore.
  Nuk përdoret Firebase Storage.
- Sistemi nuk ka asnjë foto (as artikuj, as profile përdoruesish). E vetmja
  imazh është logoja e kompanisë: ngarkohet te Cilësimet, kompresohet
  (max ~200 KB, PNG/JPG) dhe ruhet si base64 brenda dokumentit të
  cilësimeve në Firestore.
- Konfigurimi i Firebase merret nga `firebase-config.txt` dhe vendoset në
  variabla mjedisi Vite (`.env`, `VITE_FIREBASE_*`) dhe në GitHub Secrets
  për build-in. `.env` nuk shkon në git.
- Siguria nuk mbështetet te fshehja e kodit (repo mund të jetë publike), por
  te Firestore Security Rules dhe login-i.
- `data/` (backup-i me të dhënat e klientëve) dhe `firebase-config*.txt`
  shtohen te `.gitignore` që në fillim dhe nuk shkojnë kurrë në GitHub.
- Të gjitha të dhënat online. Asnjë localStorage për të dhëna biznesi.
- Vlerat monetare ruhen si numra të plotë në njësinë më të vogël
  (qindarka/cent), jo me presje dhjetore. Kjo vlen sidomos për EUR/USD
  (p.sh. 990.90 EUR → 99090).
- Strukturë e pastër: një dosje për çdo modul (pages, components, services për
  Firestore, hooks). Logjika e biznesit nuk shkruhet brenda komponentëve UI.

## Monedhat
- Monedha bazë: LEK. Opsionale: EUR dhe USD.
- Te Cilësimet ruhen kurset parazgjedhur (EUR→LEK, USD→LEK), të ndryshueshme.
- Çdo faturë, hyrje malli dhe pagesë ka monedhën e vet dhe kursin ndaj LEK,
  të ngrirë në momentin e krijimit. Ndryshimi i kursit më vonë nuk prek
  dokumentet e vjetra.
- Çmimet e artikujve janë në LEK. Kur fatura bëhet në EUR/USD, çmimet
  konvertohen me kursin e faturës dhe mund të ndryshohen me dorë.
- Gjendja e klientit (borxhi/teprica) mbahet veçmas për çdo monedhë.
- Arka dhe banka mbahen veçmas për çdo monedhë.
- Raportet shfaqin totalet në LEK (me kursin e ruajtur te çdo dokument), me
  opsion për të parë totalet sipas monedhës origjinale.

## Përdoruesit dhe rolet
| Roli       | Akses |
|------------|-------|
| Admin      | Gjithçka, përfshirë përdoruesit, cilësimet dhe importin |
| Shitës     | Faturë e re, Klientë, Historiku, Artikujt (vetëm lexim), Inventari (vetëm lexim) |
| Financë    | Financa, Pagesat, Blerje, Raporte, Historiku, Klientë (lexim) |
| Magazinier | Inventari, Blerje (hyrje malli), Artikujt |

- Adminët krijojnë përdorues dhe u caktojnë rolin.
- Lejet zbatohen edhe në Firestore Security Rules, jo vetëm duke fshehur
  butonat në UI.
- Sidebar-i shfaq vetëm rubrikat që lejon roli.
- Çmimi i blerjes (kosto) dhe fitimi nuk shfaqen për rolin Shitës.

## Struktura e menusë (sidebar)
Sidebar i errët majtas, ikonë + emër për çdo rubrikë. Rubrika aktive theksohet
me sfond më të çelur dhe ikonë me ngjyrë. Profili i përdoruesit është në fund
(inicialet në rreth, emri, roli), i ndarë me një vijë. Në telefon sidebar-i palohet në menu.

1. Faturë e Re (kryesorja, butoni më i dukshëm)
2. Historiku
3. Klientë
4. Artikujt
5. Shitjet (Dalje)
6. Blerje (Hyrje)
7. Financa (Cash Flow)
8. Inventari
9. Raporte
10. Cilësimet
— Profili i përdoruesit (në fund)

## Modeli i borxhit: kartela e klientit
Biznesi punon me gjendje të vazhdueshme për çdo klient, jo me pagesa të
lidhura me një faturë të vetme. Klienti paguan shpesh një shumë që mbulon
disa fatura, ose paguan më shumë dhe i mbetet tepricë.

- Çdo klient ka një kartelë (ledger): faturat e rrisin borxhin, pagesat dhe
  kthimet e ulin.
- Gjendja = gjendja fillestare + Σ fatura − Σ pagesa − Σ kthime.
  Gjendje pozitive = DETYRIM (klienti na detyrohet).
  Gjendje negative = TEPRICË (i kemi detyrim klientit).
- Gjendja llogaritet nga kartela, nuk shkruhet me dorë. Për shpejtësi mund të
  ruhet si fushë e përditësuar brenda të njëjtit transaction.
- Fatura ruan një "fotografi" në momentin e lëshimit: gjendja e mëparshme,
  totali i faturës, shuma e paguar në atë moment, gjendja e re. Këto
  printohen në faturë (GJENDJA, PAGUAR, DETYRIMI/TEPRICA).
### Bartja e gjendjes nga fatura në faturë
Borxhi nuk shpërndahet nëpër shumë fatura. Ai bartet gjithmonë te fatura më
e re e klientit:
- Çdo faturë e re merr si "Gjendja e mëparshme" gjendjen e mbetur të faturës
  së fundit të atij klienti (në të njëjtën monedhë).
- Gjendja e re e faturës = gjendja e mëparshme + totali i faturës − paguar.
- Në çdo moment, vetëm fatura më e fundit e klientit mban borxhin e hapur.
  Gjendja e saj e re = gjendja aktuale e klientit.
- Pagesa që vjen pa faturë të re (nga profili i klientit ose nga Financa)
  zbritet nga fatura më e fundit, ajo që mban borxhin.

### Gjendja fillestare dhe ndryshimi manual i gjendjes
Përdoruesi duhet të mund ta vendosë gjendjen e klientit me dorë (p.sh.
borxhi që klienti kishte para sistemit, ose një korrigjim). Në sistemin e
vjetër kjo bëhej duke shkruar direkt "Gjendja e mëparshme" te fatura. Në
sistemin e ri:
- Te profili i klientit ka fushë "Gjendja fillestare" (shuma + monedha +
  data). Ruhet si lëvizja e parë në kartelë.
- Te Fatura e Re, "Gjendja e mëparshme" plotësohet automatikisht, por
  përdoruesi me leje mund ta ndryshojë. Kur e ndryshon, sistemi nuk e
  fshin vlerën e llogaritur: krijon një lëvizje "rregullim manual i
  gjendjes" me diferencën, kush e bëri dhe arsyen (e detyrueshme).
- Kështu fatura printon gjendjen që vendosi përdoruesi, dhe kartela
  shpjegon gjithmonë nga erdhi çdo ndryshim.
- Lejen për ndryshim manual të gjendjes e kanë Admin dhe Financë.

### Statuset e faturës
Statusi nxirret automatikisht, nuk zgjidhet me dorë:
- **E paguar**: gjendja e re e faturës është 0 ose negative (tepricë).
  Fatura dhe çdo borxh i bartur në të janë shlyer plotësisht.
- **Pa paguar**: është fatura më e fundit e klientit dhe gjendja e saj e re
  është mbi 0. Kjo është fatura që mban borxhin aktual.
- **Pasuar**: gjendja e saj e mbetur (mbi 0) është bartur te një faturë më e
  re. Fatura është e mbyllur dhe borxhi tani ndodhet te fatura pasardhëse.
- **Anuluar**.
- Kur fatura që mban borxhin bëhet "E paguar", të gjitha faturat "Pasuar"
  para saj në të njëjtin zinxhir kalojnë automatikisht në "E paguar".
- Kur lëshohet një faturë e re dhe e mëparshmja ishte "Pa paguar", e
  mëparshmja kalon në "Pasuar".
- Draft nuk merr pjesë në zinxhir derisa të lëshohet.
- Anulimi i një fature rillogarit zinxhirin e atij klienti nga ajo faturë e
  tutje (gjendjet dhe statuset), brenda një transaction-i.
- Ky rregull u testua mbi 2,901 faturat e backup-it dhe riprodhon statusin e
  ruajtur te 2,887 prej tyre.
- Lloje të veçanta lëvizjesh në kartelë: Pagesë, Kthim malli, Zbritje,
  Postë/transport (kosto e shtuar). Secila me shënim.
- "Klient Rastësor" është klient i përhershëm për shitje me pakicë. Faturat e
  tij zakonisht paguhen menjëherë dhe nuk mbajnë borxh.

## Logjika e moduleve

### 1. Faturë e Re
- Zgjedh klientin (ose e shton të ri pa dalë nga faqja) dhe monedhën.
  Kërkimi i klientit me emër, kod (KL001…) ose qytet.
- Shton rreshta nga Artikujt: sasia, çmimi, totali i rreshtit.
- Çmimi merret automatikisht në këtë rend:
  1. çmimi preferencial i atij klienti për atë artikull (nëse ekziston),
  2. përndryshe çmimi standard i artikullit.
  Çmimi mund të ndryshohet me dorë. Kur ndryshohet, ruhet edhe çmimi origjinal
  që të shihet zbritja.
- Llogarit automatikisht: totali i faturës, gjendja e mëparshme, paguar,
  gjendja e re.
- Fushë "Shënime" e lirë (p.sh. "mungon nga porosia e parë").
- Numri i faturës është i njëpasnjëshëm dhe unik, sipas formatit te Cilësimet.
  Gjenerohet me Firestore transaction që të mos përsëritet kurrë, edhe kur dy
  përdorues lëshojnë fatura në të njëjtën sekondë.
- Kur fatura kalon nga Draft në lëshuar, në një transaction të vetëm:
  - merr numrin e radhës,
  - i zbret sasitë nga Inventari (lëvizje "dalje"),
  - shton faturën dhe pagesën (nëse ka) në kartelën e klientit,
  - shkruan veprimin te Historiku.
- Paralajmërim (jo bllokim) nëse sasia kalon stokun.
- Një faturë e lëshuar nuk fshihet dhe nuk ndryshohet. Korrigjimi bëhet me
  anulim (inventari dhe kartela kthehen mbrapsht, me arsye të detyrueshme)
  ose me faturë korrigjuese/kthim malli.
- Printim në dy formate:
  - A4 me disa shabllone (template) për të zgjedhur,
  - printer termik (gjerësia e konfigurueshme, parazgjedhur 80 mm).
- Eksport PDF dhe dërgim i shpejtë me WhatsApp (link me PDF ose përmbledhje).
- Fatura printohet me logon, të dhënat e kompanisë, sloganin, watermark-un
  dhe etiketat e konfigurueshme (shih Cilësimet).

### 2. Historiku
- Lista e të gjitha faturave me filtra: data, klienti, statusi, monedha, shuma.
- Hapja e një fature, riprintimi, anulimi (sipas rolit).
- Log i çdo veprimi në sistem (kush, çfarë, kur) për çdo dokument.

### 3. Klientë
- Profili: kodi (KL001… automatik), emri/biznesi, NIPT, qyteti, adresa,
  telefoni, email, monedha e preferuar, shënime, pikët.
- Tipi: Klient / Furnitor / Të dyja (furnitorët përdoren te Blerjet).
- Në profil shfaqen: kartela me gjendjen aktuale sipas monedhës, faturat,
  pagesat, totali i blerë, pagesa e fundit, çmimet preferenciale të tij.
- Veprim "Regjistro pagesë" direkt nga profili.
- Pikët e besnikërisë:
  - Çdo faturë e paguar i shton klientit pikë sipas rregullit te Cilësimet
    (parazgjedhur 1 pikë për çdo 100 Lek; faturat në EUR/USD konvertohen në
    LEK me kursin e faturës). Pikët shtohen kur fatura bëhet "E paguar".
  - Anulimi i faturës i heq pikët që solli.
  - Çdo ndryshim pikësh ruhet si lëvizje (fituar, përdorur, rregullim me
    dorë me arsye), që të shihet historiku i pikëve në profil.
  - "Klient Rastësor" nuk mbledh pikë.
- Printim/eksport i kartelës (ekstrakt llogarie) për një periudhë.

### 4. Artikujt
- Kodi, emri, kategoria (Meshkuj/Femra/Fëmijë/Stinore) dhe nënkategoria
  (mbathje, kanatjere...), njësia (copë, pako), çmimi i shitjes, çmimi i
  blerjes (kosto), stoku minimal.
- Çmime preferenciale: listë klient → çmim për këtë artikull.
- Sasia në stok nuk shkruhet me dorë. Llogaritet nga lëvizjet e Inventarit.

### 5. Shitjet (Dalje)
- Krijohen automatikisht nga faturat e lëshuara.
- Pamje sipas periudhës, klientit, artikullit dhe monedhës.

### 6. Blerje (Hyrje)
- Fletë hyrje malli me numër të njëpasnjëshëm.
- Zgjedh origjinën/furnitorin (p.sh. Magazina Qendrore, furnitorë të
  jashtëm), monedhën, artikujt, sasinë, çmimin e blerjes dhe çmimin e shitjes.
- Totali sipas çmimit të blerjes dhe sipas çmimit të shitjes.
- Kategoritë: Lëndë e parë / Aksesorë / Mall.
- Kur ruhet: shton sasitë në Inventar (lëvizje "hyrje"), përditëson koston e
  artikullit (opsionale), dhe për furnitorët e jashtëm krijon detyrim që,
  kur paguhet, del te Financa.

### 7. Financa (Cash Flow)
- Hyrje: pagesat e klientëve.
- Dalje: pagesat e furnitorëve dhe shpenzimet operative (paga, qira, energji,
  transport...), me kategori të konfigurueshme.
- Gjendja e arkës dhe e bankës për çdo monedhë, cash flow ditor/mujor,
  të arkëtueshmet (borxhet e klientëve) dhe të pagueshmet.

### 8. Inventari
- Gjendja aktuale për çdo artikull = shuma e lëvizjeve
  (hyrje − dalje ± rregullime).
- Regjistër lëvizjesh: data, tipi, sasia, dokumenti burim, përdoruesi.
- Rregullim manual (inventarizim) me arsye të detyrueshme.
- Paralajmërim për stok nën minimum.
- Vlera e stokut sipas kostos dhe sipas çmimit të shitjes.

### 9. Raporte
- Shitjet sipas periudhës, klientit, artikullit, kategorisë, qytetit.
- Fitimi bruto (shitje − kosto).
- Borxhet e klientëve sipas vjetërsisë (0–30, 31–60, 60+ ditë).
- Klientët më të mirë dhe artikujt më të shitur.
- Cash flow sipas monedhës.
- Vlera e inventarit.
- Eksport Excel/CSV dhe PDF.

### 10. Cilësimet
- Të dhënat e kompanisë: emri, NIPT, adresa, telefoni, email, website,
  slogani, logo, banka/IBAN.
- Pamja e faturës: shablloni, fonti dhe madhësia e fontit të artikujve,
  gjerësia e printerit termik, madhësia dhe transparenca e watermark-ut.
- Etiketat e faturës të ndryshueshme: FATURË, KLIENTI, ARTIKULLI, SASIA,
  ÇMIMI, NËNTOTALI, TOTALI, GJENDJA, PAGUAR, DETYRIMI, TEPRICA,
  FALEMINDERIT QË NA BESUAT!
- Formati dhe numërimi i faturave dhe i hyrjeve të mallit.
- Rregulli i pikëve të besnikërisë (sa Lek = 1 pikë).
- Monedhat dhe kurset parazgjedhur.
- Kategoritë dhe nënkategoritë (me opsion "Shto").
- Përdoruesit dhe rolet (vetëm Admin).
- Importi i të dhënave të vjetra (vetëm Admin).

### Profili i përdoruesit
- Emri, inicialet (në vend të fotos), roli, ndryshimi i fjalëkalimit, dalja.

## Importi i të dhënave ekzistuese
Burimi: një skedar .json (version 2) me këtë strukturë:

```
{
  exportedAt, version: 2, user,
  invoices: [{
    id, invoiceNumber (string), date (ISO, me ose pa "Z"),
    clientId, clientCode, clientName, clientCity, clientPhone,
    items: [{ itemId, name, quantity, price, total, originalPrice? }],
    currency ("Lek" | "EUR"), subtotal, tax (gjithmonë 0),
    previousBalance, previousBalanceLabel?, amountPaid, amountPaidLabel?,
    total, status ("E paguar" | "Pa paguar" | "Pasuar"),
    paymentDate?, notes?, payments?: [{ id, amount, date }]
  }],
  clients: [{ id, code, name, phone, email, address, city, points }],
  items: [{ id, name, unit, price, purchasePrice?,
            preferentialPrices?: [{ clientId, price }] }],
  stock_entries: [{
    id, entryNumber, date, origin, notes,
    items: [{ itemId, name, quantity, purchasePrice, sellingPrice, total }],
    totalPurchaseValue, totalSellingValue
  }],
  config: { name, nipt, address, phone, email, website, slogan,
            logoUrl (base64), invoiceTemplate, itemFont, itemFontSize,
            thermalWidth, watermarkSize, watermarkOpacity, label* }
}
```

Përshtatja (mapping):
- clients → Klientë. Ruaj id-të e vjetra si ID dokumenti. "Klient Rastësor"
  bëhet klienti i pakicës.
- items → Artikujt. preferentialPrices → çmimet preferenciale.
  purchasePrice → kosto (mund të mungojë).
- invoices → Faturat, me numrat origjinalë. Shuma në EUR kthehen në cent.
  Datat normalizohen në Timestamp.
- Kartela e klientit rindërtohet nga faturat, sipas rendit të id-së (jo të
  numrit): për çdo faturë një lëvizje "faturë" (subtotal) dhe, nëse
  amountPaid > 0, një lëvizje "pagesë" (amountPaid, data = paymentDate ose
  data e faturës). payments[] importohen si pagesa më vete.
- Gjendja e vendosur me dorë: te sistemi i vjetër përdoruesi e shkruante
  "previousBalance" me dorë. Importi e trajton kështu:
  - Te fatura e parë e klientit, previousBalance ≠ 0 (9 klientë) →
    lëvizje "gjendje fillestare".
  - Te faturat e tjera, kur previousBalance ≠ gjendja e re e faturës para
    saj (96 raste te 46 klientë) → lëvizje "rregullim manual i gjendjes"
    me diferencën, shënim "importuar nga sistemi i vjetër".
  - Kështu gjendjet e importuara përputhen saktë me ato të printuara në
    fatura. Të gjitha këto lëvizje listohen në raportin e importit.
- Gjendja përfundimtare e çdo klienti = gjendja e re e faturës së tij të
  fundit.
- previousBalanceLabel / amountPaidLabel jo-standarde ("Posta", "DISCOUNT",
  "Kthim") importohen si lloji përkatës i lëvizjes ose si shënim.
- stock_entries → Blerje (hyrje malli), me lëvizjet e inventarit.
- Inventari fillestar: stoku = Σ hyrje − Σ sasi të faturuara. Pas importit,
  shfaq listën e artikujve me stok negativ për inventarizim.
- config → Cilësimet. Logo base64 ruhet ashtu siç është te dokumenti i cilësimeve.
- points → gjendja fillestare e pikëve të klientit, e importuar si një
  lëvizje "gjendje fillestare". Pikët e vjetra nuk rillogariten.

Problemet e njohura në këtë backup që importi duhet t'i trajtojë:
- Numra të dyfishtë: 19 numra faturash përsëriten te 109 fatura
  (20 shkurt – 8 prill 2026). Shkaku ishte një gabim në aplikacionin e vjetër
  që nuk e rifreskonte numrin dhe datën te fatura e re. Në sistemin e ri
  numrat duhet të jenë unikë, pa përjashtim:
  - Data e vërtetë e këtyre faturave nxirret nga id-ja e tyre (është
    timestamp në milisekonda), jo nga fusha "date".
  - Brenda çdo grupi me të njëjtin numër, fatura më e vjetër (sipas id-së)
    e mban numrin.
  - 90 faturat e tjera marrin numra të rinj unikë, duke vazhduar pas numrit
    më të madh (2963, 2964, …) sipas rendit kronologjik.
  - Numri i vjetër ruhet në fushën "numriVjeter" dhe gjendet me kërkim, që
    faturat e printuara në letër të gjenden.
  - Numërimi për faturat e reja vazhdon pas këtyre (3053+).
  - Pas importit, kontrollo që nuk ka asnjë numër të përsëritur.
- 2 rreshta faturash i referohen artikujve që nuk ekzistojnë dhe 1 faturë një
  klienti që nuk ekziston. Krijo artikull/klient "arkivuar" me emrin nga
  fatura, në vend që t'i hedhësh.
- Statuset rillogariten me rregullin e "Bartjes së gjendjes". Rregulli
  përputhet me statusin e vjetër te 2,887 nga 2,901 fatura. 14 faturat që
  dalin ndryshe (6 "Pasuar"→"E paguar", 4 "Pa paguar"→"E paguar",
  4 "Pa paguar"→"Pasuar") shfaqen te raporti i importit, dhe Admini zgjedh
  për secilën: statusi i ri i llogaritur ose ai i vjetër.

Rrjedha e importit (vetëm Admin, te Cilësimet):
1. Ngarko .json-in.
2. Shfaq paraprakisht: sa klientë, artikuj, fatura, hyrje do importohen, plus
   lista e problemeve më sipër.
3. Importo pas konfirmimit, në batch-e (max 500 shkrime për batch), me
   progres të dukshëm.
4. Raport përfundimtar me çdo ndryshim ose gabim.
- Importi mund të përsëritet pa krijuar dublikata (kontroll sipas id-së së
  vjetër).

## Struktura në Firestore
companies/{companyId}/
  clients, items, invoices (rreshtat brenda faturës), ledger (lëvizjet e
  kartelës: faturë, pagesë, kthim, zbritje, postë), loyaltyPoints (lëvizjet
  e pikëve), purchases (hyrje malli),
  stockMovements, expenses, auditLog, counters, settings
users/{uid} → companyId, roli, emri

## Rregulla të detyrueshme
- Firestore Security Rules: vetëm përdoruesit e kompanisë lexojnë/shkruajnë
  të dhënat e saj, sipas rolit.
- Lëshimi i faturës, numri, ulja e stokut dhe kartela bëhen në një
  transaction të vetëm.
- Numri i faturës është unik, pa përjashtim. Para çdo ruajtjeje kontrollohet
  që numri nuk ekziston.
- Asnjë fshirje fizike e dokumenteve financiare. Vetëm anulim (soft delete).
- Çdo veprim shkruhet te auditLog.
- Dizajn responsive, që punon edhe në telefon.
- Performancë: listat e mëdha (2,900+ fatura) me faqe/pagination dhe
  indekse Firestore, jo duke ngarkuar gjithçka njëherësh.

## Mënyra e punës
Ndërto me faza dhe ndalo pas secilës që ta testoj:
1. Projekti, Firebase, login, rolet, sidebar-i, Cilësimet dhe deploy-i
   automatik në GitHub Pages.
2. Klientë (me kartelën) dhe Artikujt (me çmimet preferenciale).
3. Faturë e Re, Historiku, printimi A4/termik dhe PDF.
4. Inventari, Blerje dhe Shitjet.
5. Financa dhe Raporte.
6. Importi i të dhënave të vjetra, i testuar fillimisht në një projekt
   Firebase prove.
