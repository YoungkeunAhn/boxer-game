import { useState, type FormEvent } from "react";
import {
  BOXER_TYPE_META,
  BOXER_TYPES,
  DEFAULT_BOXER_TYPE,
  DEFAULT_GENDER,
  GENDER_META,
  GENDERS,
} from "../game/constants";
import { useGameStore } from "../stores/gameStore";
import type { BoxerType, Gender } from "../game/types";
import styles from "./BoxerCreation.module.css";

export function BoxerCreation() {
  const createBoxer = useGameStore((state) => state.createBoxer);
  const storageWarning = useGameStore((state) => state.storageWarning);
  const legacySaveDetected = useGameStore((state) => state.legacySaveDetected);

  const [name, setName] = useState("");
  const [boxerType, setBoxerType] = useState<BoxerType>(DEFAULT_BOXER_TYPE);
  const [gender, setGender] = useState<Gender>(DEFAULT_GENDER);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createBoxer(name, boxerType, gender);
  }

  return (
    <section className={styles.creation}>
      <p className={styles.kicker}>BOXER GROWTH PROJECT</p>
      <h1 className={styles.title}>복서키우기</h1>
      <p className={styles.subtitle}>
        자동으로 몬스터를 쓰러뜨리고 강해져 보스에게 도전하세요.
      </p>

      {legacySaveDetected && (
        <p className={styles.warning} role="alert">
          이전 버전 저장 데이터는 새 복서 형식과 호환되지 않습니다. 기존 저장은
          보존되며, 새 복서를 만들면 v3 진행이 시작됩니다.
        </p>
      )}
      {storageWarning && (
        <p className={styles.warning} role="alert">
          {storageWarning}
        </p>
      )}

      <form onSubmit={handleCreate}>
        <label className={styles.label} htmlFor="boxer-name">
          복서 이름
        </label>
        <input
          className={styles.input}
          id="boxer-name"
          maxLength={16}
          onChange={(event) => setName(event.target.value)}
          placeholder="무명 복서"
          value={name}
        />

        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>타입</legend>
          <div className={styles.optionGrid}>
            {BOXER_TYPES.map((type) => {
              const meta = BOXER_TYPE_META[type];
              const selected = boxerType === type;
              return (
                <button
                  key={type}
                  type="button"
                  className={`${styles.option} ${selected ? styles.optionSelected : ""}`}
                  aria-pressed={selected}
                  data-testid={`type-${type}`}
                  onClick={() => setBoxerType(type)}
                >
                  <span className={styles.optionLabel}>{meta.label}</span>
                  <span className={styles.optionTagline}>{meta.tagline}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>성별</legend>
          <div className={styles.optionGrid}>
            {GENDERS.map((value) => {
              const selected = gender === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={`${styles.option} ${selected ? styles.optionSelected : ""}`}
                  aria-pressed={selected}
                  data-testid={`gender-${value}`}
                  onClick={() => setGender(value)}
                >
                  <span className={styles.optionLabel}>{GENDER_META[value].label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <button className={styles.submit} type="submit">
          커리어 시작하기
        </button>
      </form>
    </section>
  );
}
