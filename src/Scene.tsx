// Scene.tsx — the agent's surface.
// Add SDK components and R3F primitives here.
// See GROUNDING.md for the API reference and pattern catalog.
//
// react/no-unknown-property is disabled for this file in .eslintrc.json, not by
// a directive here: R3F props (position, rotation, args) are unknown to the rule
// and every one of them errors, but this file is EMPTY of primitives until an
// agent adds some — so an in-file directive sits unused, and the lint script
// runs --report-unused-disable-directives, which makes the unused directive
// itself the error. Disabling at the config keeps the suppression true in both
// states.
import {
  ScreenSpaceUI,
  ScreenText,
  type ScreenTransform2DSettings,
} from "@vincentt-xr/sdk";

import { FaceBoundingBox } from "./FaceBoundingBox";
import { FooterHud } from "./FooterHud";

const HELLO_TRANSFORM: ScreenTransform2DSettings = {
  enabled: true,
  position: { x: 0, y: 540 },
  size: { width: 620, height: 96 },
  pivot: [0.5, 0.5],
  rotation: 0,
  scale2D: { x: 1, y: 1 },
  referencePixelsPerUnit: 32,
  renderOrder: 1000,
  overlay: true,
  visible: true,
  showTransformGuides: false,
};

export const Scene = () => (
  <>
    <FaceBoundingBox />
    <FooterHud />
    <ScreenSpaceUI>
      <ScreenText
        name="trackingTitle"
        text="Welcome to the Vincentt XR"
        screenTransform={HELLO_TRANSFORM}
        textAlign="center"
        verticalAlign="center"
        fontFamily='"Space Grotesk", sans-serif'
        fontWeight={700}
        fontSize={54}
        resolution={150}
        letterSpacing={0.04}
        color="#f8fafc"
        strokeColor="#0f172a"
        strokeWidth={8}
        strokeOpacity={0.92}
        shadowColor="#38bdf8"
        shadowBlur={10}
        shadowOffsetY={4}
        shadowOpacity={0.82}
        bgColor="transparent"
      />
    </ScreenSpaceUI>
  </>
);
