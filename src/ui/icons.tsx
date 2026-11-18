// The website widget's icons (Lucide), drawn with react-native-svg.
import Svg, { Circle, Path } from "react-native-svg";

const PATHS = {
  close: ["M18 6 6 18", "m6 6 12 12"],
  back: ["m15 18-6-6 6-6"],
  send: [
    "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",
    "m21.854 2.147-10.94 10.939",
  ],
  attach: [
    "m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551",
  ],
  external: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
  home: [
    "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
    "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  ],
  messages: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", "M13 8H7", "M17 12H7"],
  file: [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
    "M14 2v4a2 2 0 0 0 2 2h4",
    "M10 9H8",
    "M16 13H8",
    "M16 17H8",
  ],
  info: ["M12 16v-4", "M12 8h.01"],
  chat: ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  color,
  strokeWidth = 2,
  fill = "none",
}: {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
  fill?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "info" && <Circle cx={12} cy={12} r={10} />}
      {PATHS[name].map((d, index) => (
        <Path key={index} d={d} fill={index === PATHS[name].length - 1 || name !== "home" ? fill : "none"} />
      ))}
    </Svg>
  );
}
