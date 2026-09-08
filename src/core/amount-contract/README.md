# Shared Counterparty amount contract

`amounts.ts` and `amounts-v1.json` are byte-identical copies of `src/amounts.ts` and `contracts/amounts-v1.json` in XCP/wallet-sdk at commit `6296162d6cb1bb3b17d48e9879f4f106baef9212`. The extension does not depend on wallet-sdk; vendoring its pure module avoids pulling its browser wallet runtime into this independently implemented wallet.

Do not modify the copies locally. Update from a reviewed upstream commit, update the provenance hashes, and run the shared vector/drift test. Input uses ASCII digits and a period independently of language, display-number locale, and fiat currency. Fees retain up to eight fractional places without asset scaling; generated network quotes may intentionally use fewer places.
