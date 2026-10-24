// Logá klientov pre lištu klientov.
// src: cesta k jednofarebnému SVG, name: názov klienta (alt text).
// height: optická výška loga v px na desktope (mobil = 75 %). Výšky sú vyvážené
// podľa pomeru strán a hustoty kresby, aby logá pôsobili rovnocenne.
// Menej ako 4 logá = statické zobrazenie, prázdne pole = lišta sa skryje.
export const clients = [
  { src: 'assets/clients/obec-gerlachov.svg', name: 'Obec Gerlachov', height: 43 },
  { src: 'assets/clients/stoplus.svg', name: 'Stoplus', height: 23 },
  { src: 'assets/clients/memc-ichthys.svg', name: 'MEMC Ichthys', height: 42 },
  { src: 'assets/clients/monks-and-freaks.svg', name: 'Monks and Freaks', height: 30 },
  { src: 'assets/clients/optika-krigovsky.svg', name: 'Optika Krigovský', height: 39 },
  { src: 'assets/clients/mladez-baptisticka.svg', name: 'Mládež Baptistickej cirkvi', height: 37 },
  { src: 'assets/clients/sem.svg', name: 'SEM', height: 22 },
];
