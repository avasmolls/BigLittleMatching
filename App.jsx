import { useState } from "react";
import UploadPage from "./UploadPage.jsx";
import ResultsPage from "./ResultsPage.jsx";
import { runMatch } from "./api.js";

export default function App() {
  const [data, setData] = useState(null); // { result, files, run }
  if (!data) return <UploadPage onResult={(result, files) => setData({ result, files, run: 1 })} />;
  return (
    <ResultsPage
      key={data.run}
      result={data.result}
      onBack={() => setData(null)}
      onRerun={async locked => {
        const result = await runMatch(data.files.bigs, data.files.littles, locked);
        setData({ ...data, result, run: data.run + 1 });
      }}
    />
  );
}
