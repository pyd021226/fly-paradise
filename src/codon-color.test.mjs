import { codonPhenotype, colorFromCodon } from './codon-color.mjs';

function eq(a, b) {
  if (a === b) return;
  if (a && b && a.color === b.color && a.bright === b.bright) return;
  throw new Error('want ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
}

eq(codonPhenotype(''), null);
eq(codonPhenotype('11'), null);
eq(codonPhenotype('1124'), null);
eq(codonPhenotype('11244'), { color: 'green', bright: false });
eq(codonPhenotype('11243'), null);
eq(codonPhenotype('11241'), null);
eq(codonPhenotype('11242'), null);
eq(codonPhenotype('112431'), { color: 'green', bright: false });
eq(codonPhenotype('112432'), { color: 'green', bright: false });
eq(codonPhenotype('112433'), { color: 'green', bright: false });
eq(codonPhenotype('112434'), { color: 'green', bright: true });
eq(codonPhenotype('112444'), { color: 'green', bright: true });
eq(codonPhenotype('11233'), { color: 'red', bright: false });
eq(codonPhenotype('11234'), null);
eq(codonPhenotype('112343'), { color: 'red', bright: true });
eq(codonPhenotype('112341'), { color: 'red', bright: false });
eq(codonPhenotype('11222'), { color: 'yellow', bright: false });
eq(codonPhenotype('11221'), null);
eq(codonPhenotype('112212'), { color: 'yellow', bright: true });
eq(codonPhenotype('112214'), { color: 'yellow', bright: false });
eq(codonPhenotype('1125x'), null);
eq(codonPhenotype('1124444'), { color: 'green', bright: true });

eq(colorFromCodon('11244', 'wild'), 'green');
eq(colorFromCodon('11243', 'wild'), 'wild');
eq(colorFromCodon('112434', 'wild'), 'green2');
eq(colorFromCodon('11233', 'deep'), 'red');
eq(colorFromCodon('11222', 'mid'), 'yellow');
eq(colorFromCodon('112212', 'mid'), 'yellow2');

console.log('codon-color ok');
