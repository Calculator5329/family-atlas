import { Back } from "@/components/bits";

export default function NotFound() {
  return (
    <div className="page page--narrow">
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, marginBottom: 12 }}>
        Nothing here
      </h1>
      <p className="dim" style={{ marginBottom: 20 }}>
        That link points at a person, story or place the tree does not hold.
      </p>
      <Back to="/">Back to the chronicle</Back>
    </div>
  );
}
