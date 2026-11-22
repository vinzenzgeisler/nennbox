import { useEffect, useMemo, useState } from 'react';
import {
  AppButton,
  ChoiceCard,
  ChoiceGroup,
  OnboardingFileButton,
  OnboardingIcon,
  QuestionStep,
} from '@nennbox/ui';
import { suggestBrandColors } from '@nennbox/contracts';
import { icons } from '../icons.js';
import { sampleImageColors, sampleLogos } from './logo.js';
import type { StepProps } from './types.js';

export type LogoState = { url: string; name: string; colors: string[] } | null;

const Swatches = ({ primary, accent }: { primary: string; accent: string }) => (
  <span className="nb-onb-swatches">
    <i style={{ background: primary }} />
    <i style={{ background: accent }} />
  </span>
);

export function BrandStep({
  logo,
  setLogo,
  ...step
}: StepProps & { logo: LogoState; setLogo: (logo: LogoState) => void }) {
  const { patch, resolved, next } = step;
  const [error, setError] = useState<string>();
  const palettes = useMemo(
    () => suggestBrandColors(logo?.colors ?? []),
    [logo],
  );
  const selected = palettes.findIndex(
    (p) =>
      p.primary === resolved.primaryColor && p.accent === resolved.accentColor,
  );
  // Preselect the first suggestion as soon as a logo brings new colours.
  const logoKey = logo?.url;
  useEffect(() => {
    if (!logo || !palettes[0]) return;
    patch({
      primaryColor: palettes[0].primary,
      accentColor: palettes[0].accent,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoKey]);

  const upload = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type))
      return setError('Bitte ein Bild als PNG, JPG, SVG oder WebP wählen.');
    setError(undefined);
    if (file.size > 2_000_000)
      return setError('Bitte ein Logo unter 2 MB wählen.');
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      if (!url) return setError('Dieses Bild konnte nicht gelesen werden.');
      const image = new Image();
      image.onload = () => {
        setLogo({ url, name: file.name, colors: sampleImageColors(image) });
        patch({ logoName: file.name });
      };
      image.onerror = () =>
        setError('Dieses Bild konnte nicht gelesen werden.');
      image.src = url;
    };
    reader.onerror = () => setError('Dieses Bild konnte nicht gelesen werden.');
    reader.readAsDataURL(file);
  };
  const choose = (id: string) => {
    const sample = sampleLogos.find((entry) => entry.id === id)!;
    setLogo({ url: sample.url, name: sample.name, colors: sample.colors });
    patch({ logoName: sample.name });
  };

  return (
    <QuestionStep
      eyebrow={step.eyebrow}
      title="Habt ihr ein Logo?"
      lead="Dann schlagen wir Farben daraus vor. Ohne Logo nutzt ihr zunächst die NENNBOX-Farben."
      onSubmit={next}
    >
      <div className="nb-onb-upload">
        <span className="nb-onb-upload-art" aria-hidden="true">
          {logo ? (
            <img src={logo.url} alt="" />
          ) : (
            <OnboardingIcon path={icons.brand} />
          )}
        </span>
        <div className="nb-onb-upload-text">
          <OnboardingFileButton
            label="Logo hochladen"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onSelect={upload}
            describedBy="nb-onb-upload-hint"
          />
          <small id="nb-onb-upload-hint" className={error ? 'is-error' : ''}>
            {error ??
              (logo
                ? logo.name
                : 'PNG, JPG, SVG oder WebP bis 2 MB. Ihr könnt es später austauschen.')}
          </small>
        </div>
      </div>
      <div>
        <p className="nb-onb-subtitle">Oder ein Beispiellogo ausprobieren</p>
        <div className="nb-onb-samples">
          {sampleLogos.map((sample) => (
            <AppButton
              key={sample.id}
              aria-pressed={logo?.url === sample.url}
              onClick={() => choose(sample.id)}
            >
              <img src={sample.url} alt="" width={20} height={20} />
              {sample.name}
            </AppButton>
          ))}
          {logo && (
            <AppButton
              tone="ghost"
              onClick={() => {
                setLogo(null);
                patch({
                  logoName: null,
                  primaryColor: null,
                  accentColor: null,
                });
              }}
            >
              Logo entfernen
            </AppButton>
          )}
        </div>
      </div>
      <ChoiceGroup columns={2} aria-label="Farben">
        {palettes.map((palette, index) => (
          <ChoiceCard
            key={`${palette.primary}${palette.accent}`}
            value={`${index}`}
            checked={selected === index || (selected < 0 && index === 0)}
            onChange={() =>
              patch({
                primaryColor: palette.primary,
                accentColor: palette.accent,
              })
            }
            title={logo ? `Palette ${index + 1}` : 'NENNBOX-Grün'}
            description={
              palette.adjusted
                ? 'Leicht abgedunkelt, damit Text darauf gut lesbar bleibt.'
                : `Hauptfarbe ${palette.primary}, Akzent ${palette.accent}`
            }
            illustration={
              <Swatches primary={palette.primary} accent={palette.accent} />
            }
            consequence={
              logo
                ? 'Farben für Veranstaltungsseite und Nennformular'
                : undefined
            }
            badge={index === 0 && logo ? 'Empfohlen' : undefined}
          />
        ))}
      </ChoiceGroup>
    </QuestionStep>
  );
}
