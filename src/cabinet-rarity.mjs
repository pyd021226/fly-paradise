// Ported from the earlier FlyParadise-Cabinet project (same author, same license).
// Collection grades are derived from saved body colors, never from codons.
// Collection grades are derived from saved body colors, never from codons.
const spectrum='conic-gradient(from 20deg,#fac9db,#f9dda9,#dcf0b9,#b3eadb,#b9d8f5,#d9c7f5,#f4c5e3,#fac9db)';
const definitions=[
 ['F','#FFFFFF','#475569'],['E','#B7D9BB','#244A2F'],['D','#AACBE9','#183F66'],
 ['C','#C3AAE0','#48296A'],['B','#E7C27A','#624611'],['A','#DB7B80','#4E111A'],
 ['S','#812B3A','#FFF0F1'],['SS','#FBFAFE','#3F415D'],['SSS','#FBFAFE','#3F415D'],
];
export const RARITY_LEVELS=Object.freeze(definitions.map(([grade,surface,ink],rank)=>Object.freeze({
 grade,label:grade+' 级',rank,surface,ink,badgeSurface:surface,
 effect:grade==='SSS'?'animated':grade==='SS'?'spectrum':'solid',
 spectrum:grade==='SS'||grade==='SSS'?spectrum:null,
})));
const ungraded=Object.freeze({grade:'?',label:'未评级',rank:null,surface:'#F2F3F2',ink:'#596471',badgeSurface:'#F2F3F2',effect:'solid',spectrum:null});
const colorGrades=Object.freeze({wild:'F',mid:'E',deep:'E',white:'D',red:'C',yellow:'C',green:'B',red2:'A',yellow2:'A',green2:'S'});
export function rarityByGrade(grade){return typeof grade==='string'?RARITY_LEVELS.find(v=>v.grade===grade)||ungraded:ungraded;}
export function rarityForColor(color){return typeof color==='string'&&Object.hasOwn(colorGrades,color)?rarityByGrade(colorGrades[color]):ungraded;}
