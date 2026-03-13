export function AuthLoadingSkeleton() {
  return (
    <div className="w-full flex justify-center pb-8 animate-pulse">
      <div className="w-[448px] h-[500px] bg-white dark:bg-neutral-900 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 flex flex-col p-8">
        <div className="flex gap-4 justify-between w-full mb-8">
          <div className="w-1/2 h-10 bg-neutral-200 dark:bg-neutral-800 rounded-md"></div>
          <div className="w-1/2 h-10 bg-neutral-200 dark:bg-neutral-800 rounded-md"></div>
        </div>
        
        <div className="flex flex-col gap-6 mt-6">
          <div className="w-full flex flex-col gap-2">
            <div className="w-16 h-4 bg-neutral-200 dark:bg-neutral-800 rounded-md"></div>
            <div className="w-full h-10 bg-neutral-200 dark:bg-neutral-800 rounded-md"></div>
          </div>
          <div className="w-full flex flex-col gap-2">
            <div className="w-16 h-4 bg-neutral-200 dark:bg-neutral-800 rounded-md"></div>
            <div className="w-full h-10 bg-neutral-200 dark:bg-neutral-800 rounded-md"></div>
          </div>
        </div>
        
        <div className="w-full h-10 bg-neutral-300 dark:bg-neutral-700 rounded-md mt-6"></div>
      </div>
    </div>
  );
}
