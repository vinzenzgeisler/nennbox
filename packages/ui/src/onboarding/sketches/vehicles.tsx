import { Bike, Car, Ground, Plate, Sketch, VintageCar } from './Sketch.js';

export const EraHistoric = () => (
  <Sketch>
    <VintageCar x={26} y={34} s={1.8} />
    <Plate x={108} y={12} w={40} h={18} text="1958" size={11} />
    <Ground y={90} />
  </Sketch>
);

export const EraModern = () => (
  <Sketch>
    <Car x={24} y={34} s={1.9} />
    <path className="sk sk-thin sk-dash" d="M8 52 H22 M4 60 H18 M10 68 H22" />
    <Ground y={90} />
  </Sketch>
);

export const EraMixed = () => (
  <Sketch>
    <VintageCar x={10} y={44} s={1.05} />
    <Car x={84} y={44} s={1.1} />
    <path className="sk sk-accent" d="M72 36 V70 M66 52 H78" />
    <Ground y={90} />
  </Sketch>
);

export const TypeCar = () => (
  <Sketch>
    <Car x={26} y={34} s={1.8} />
    <Ground y={90} />
  </Sketch>
);

export const TypeMotorcycle = () => (
  <Sketch>
    <Bike x={30} y={32} s={1.9} />
    <Ground y={90} />
  </Sketch>
);

export const TypeBoth = () => (
  <Sketch>
    <Car x={6} y={48} s={1.1} />
    <Bike x={90} y={44} s={1.15} />
    <Ground y={90} />
  </Sketch>
);
