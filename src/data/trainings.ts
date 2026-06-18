import type { Training } from "../game/types";

export const TRAININGS: readonly Training[] = [
  {
    id: "heavy_bag",
    name: "샌드백 훈련",
    description: "묵직한 펀치를 반복해 공격력을 키웁니다.",
    statGains: { attack: 2 },
  },
];

export function findTraining(id: string): Training | undefined {
  return TRAININGS.find((training) => training.id === id);
}

