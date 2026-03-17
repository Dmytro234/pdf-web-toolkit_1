import { createBrowserRouter, Link, Outlet } from "react-router-dom";

import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import HomePage from "./pages/HomePage";

import MergeTool from "./components/tools/MergeTool";
import SplitTool from "./components/tools/SplitTool";
import EditTool from "./components/tools/EditTool";
import CompressTool from "./components/tools/CompressTool";
import ExtractTool from "./components/tools/ExtractTool";
import DeletePagesTool from "./components/tools/DeletePagesTool";
import ConvertTool from "./components/tools/ConvertTool";
import CropTool from "./components/tools/CropTool";
import AlignTool from "./components/tools/AlignTool";

function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">404</h1>
        <p className="mt-2 text-sm text-slate-600">Сторінку не знайдено.</p>
        <Link
          to="/"
          className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          На головну
        </Link>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: "merge",
        element: <MergeTool />
      },
      {
        path: "split",
        element: <SplitTool />
      },
      {
        path: "edit",
        element: <EditTool />
      },
      {
        path: "compress",
        element: <CompressTool />
      },
      {
        path: "extract",
        element: <ExtractTool />
      },
      {
        path: "delete-pages",
        element: <DeletePagesTool />
      },
      {
        path: "convert",
        element: <ConvertTool />
      },
      {
        path: "crop",
        element: <CropTool />
      },
      {
        path: "align",
        element: <AlignTool />
      },
      {
        path: "*",
        element: <NotFoundPage />
      }
    ]
  }
]);