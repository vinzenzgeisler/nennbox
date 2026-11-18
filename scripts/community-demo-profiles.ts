import { rows } from './community-demo-data.js';

const emailPart = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Stable, reserved-domain address shared by all demo seed helpers. */
export function demoEmail(index: number): string {
  const [firstName, ...lastName] = rows[index]![0].split(' ');
  return `${emailPart(firstName!)}.${emailPart(lastName.join('-'))}.${String(index + 1).padStart(3, '0')}@example.org`;
}

const addresses = [
  ['Elbhangstraße 18', '01309', 'Dresden'],
  ['Am Stadtpark 7', '04109', 'Leipzig'],
  ['Waldweg 24', '01099', 'Dresden'],
  ['Rosenstraße 5', '09111', 'Chemnitz'],
  ['Bergstraße 31', '14467', 'Potsdam'],
  ['Hafenallee 12', '18055', 'Rostock'],
  ['Lindenweg 9', '99084', 'Erfurt'],
  ['Mühlenstraße 22', '99423', 'Weimar'],
] as const;
const emergencyNames = [
  'Nora Falk',
  'Peter Lenz',
  'Sabine Krüger',
  'Jens Adler',
  'Claudia Beck',
  'Ralf Sommer',
];
const histories = [
  'Seit 2018 im Familienbesitz, Motor 2022 überholt; zuletzt bei zwei Gleichmäßigkeitsläufen eingesetzt.',
  'Karosserie vor drei Jahren restauriert, Fahrwerk und Bremsen im vergangenen Winter erneuert.',
  'Aus ehemaligem Clubfahrzeug aufgebaut; Motor seit der Revision rund 1.800 km gelaufen.',
  'Seit 2020 regelmäßig gewartet, originale Technik mit zeitgenössischen Sicherheitsupdates.',
  'Teilrestaurierung 2019–2021, seitdem hauptsächlich für Bergrennen und Trainings genutzt.',
  'Fahrzeug 2017 übernommen und schrittweise technisch revidiert; keine bekannten Unfallschäden.',
] as const;
const bloodGroups = ['A+', '0+', 'B+', 'A-', '0-', 'AB+'] as const;
const publicationPreferences = ['name_visible', 'initials', 'hidden'] as const;

export function demoProfile(
  index: number,
  classCode: string,
  fullName: string,
) {
  const [street, postalCode, city] = addresses[index % addresses.length]!;
  const firstName = fullName.split(' ')[0]!;
  const classDetails: Record<
    string,
    { displacementCc: number; cylinders: number }
  > = {
    H1: {
      displacementCc: [998, 1098, 1275, 1298][index % 4]!,
      cylinders: [4, 4, 4, 6][index % 4]!,
    },
    H2: {
      displacementCc: [1588, 1796, 1968, 1998][index % 4]!,
      cylinders: [4, 4, 6, 4][index % 4]!,
    },
    M4: {
      displacementCc: [125, 175, 249, 250][index % 4]!,
      cylinders: [1, 1, 2, 2][index % 4]!,
    },
    M6: {
      displacementCc: [398, 599, 748, 998][index % 4]!,
      cylinders: [4, 4, 2, 4][index % 4]!,
    },
  };
  const vehicle = classDetails[classCode]!;
  return {
    phone: `+49 151 ${String(23450000 + index * 137).padStart(8, '0')}`,
    street,
    postalCode,
    city,
    emergencyContactName: emergencyNames[index % emergencyNames.length]!,
    emergencyContactPhone: `+49 160 ${String(67230000 + index * 191).padStart(8, '0')}`,
    publicationPreference:
      publicationPreferences[index % publicationPreferences.length]!,
    bloodGroup: bloodGroups[index % bloodGroups.length]!,
    licenseNumber: `DMSB-DEMO-${String(index + 1).padStart(4, '0')}`,
    ...vehicle,
    transponderNumber: `AMB-${String(410000 + index * 17)}`,
    vehiclePassNumber: `VP-${String(26000 + index).padStart(5, '0')}`,
    ownerName: index % 5 === 0 ? `${firstName} und Familie` : fullName,
    history: histories[index % histories.length]!,
  };
}

export function demoPassenger(index: number, fullName: string) {
  if (index % 7 !== 2 && index % 9 !== 4) return null;
  const first = ['Leonie', 'Martin', 'Katrin', 'Oliver', 'Franziska', 'Daniel'][
    index % 6
  ]!;
  const last = [
    'Falkenberg',
    'Hartmann',
    'Keller',
    'Neumann',
    'Reuter',
    'Vogel',
  ][index % 6]!;
  const [street, postalCode, city] = addresses[(index + 3) % addresses.length]!;
  return {
    firstName: first,
    lastName: last,
    email: `${emailPart(first)}.${emailPart(last)}.${String(index + 1).padStart(3, '0')}@example.org`,
    phone: `+49 171 ${String(31840000 + index * 211).padStart(8, '0')}`,
    street,
    postalCode,
    city,
    emergencyContactName: fullName,
    emergencyContactPhone: `+49 172 ${String(52810000 + index * 173).padStart(8, '0')}`,
  };
}
