import { codonPhenotype, colorFromCodon, appendCodon, familyHit } from './codon-color.mjs';

function eq(a, b) {
  if (a === b) return;
  if (a && b && a.color === b.color && a.bright === b.bright) return;
  if (a && b && a.fam === b.fam && a.index === b.index) return;
  throw new Error('want ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
}

eq(codonPhenotype(''), null);
eq(codonPhenotype('11'), null);
eq(codonPhenotype('1124'), { color: 'green', bright: false });
eq(codonPhenotype('1123'), { color: 'red', bright: false });
eq(codonPhenotype('1122'), { color: 'yellow', bright: false });
eq(codonPhenotype('1121'), null);
eq(codonPhenotype('11244'), { color: 'green', bright: false });
eq(codonPhenotype('11243'), null);
eq(codonPhenotype('21124'), { color: 'green', bright: false });
eq(codonPhenotype('41123'), { color: 'red', bright: false });
eq(codonPhenotype('11123'), { color: 'red', bright: false });
eq(codonPhenotype('112444'), { color: 'green', bright: true });
eq(codonPhenotype('112433'), null);
eq(codonPhenotype('11233'), { color: 'red', bright: false });
eq(codonPhenotype('11234'), null);
eq(codonPhenotype('11222'), { color: 'yellow', bright: false });
eq(codonPhenotype('11221'), null);

eq(colorFromCodon('1124', 'wild'), 'green');
eq(colorFromCodon('21124', 'wild'), 'green');
eq(colorFromCodon('11243', 'wild'), 'wild');
eq(colorFromCodon('112444', 'wild'), 'green2');
eq(colorFromCodon('411233', 'deep'), 'red');

eq(appendCodon('12345678', '9'), '123456789');
eq(appendCodon('123456789', '1'), '234567891');
eq(familyHit('xx1124yy').fam, '1124');

console.log('codon-color ok');
