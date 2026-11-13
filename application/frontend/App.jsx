import { useState } from "react";
import UploadPage from "./UploadPage.jsx";
import ResultsPage from "./ResultsPage.jsx";
import { runMatch } from "../backend/api.js";

export default function App() {
  const [data, setData] = useState(null); // { result, files }
  if (!data) return <UploadPage onResult={(result, files) => setData({ result, files })} />;
  return (
    <ResultsPage
      result={data.result}
      onBack={() => setData(null)}
      onRerun={async locked => {
        const result = await runMatch(data.files.bigs, data.files.littles, locked);
        setData({ ...data, result });
      }}
    />
  );
}
