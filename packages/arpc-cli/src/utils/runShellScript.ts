import { spawnSync } from "child_process";

// Runs a shell script and outputs the result/manages the exit code of the program
// automatically. This function is blocking because there shouldn't be multiple of
// it running anyway.
export function runShellScript(cmd: string, args: string[], cwd: string) {
    // Copy the current process's environment variables.
    const env = { ...process.env };

    // Delete the current working directory if it is set.
    delete env.PWD;

    // Run the command.
    const result = spawnSync(cmd, args, {
        shell: env.SHELL || true,
        stdio: "inherit",
        env,
        cwd,
    });
    if ((result.status || 0) !== 0) {
        process.exit(result.status);
    }
    if (result.error) {
        throw result.error;
    }
}
