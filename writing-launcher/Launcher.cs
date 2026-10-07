using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("Author writing Windows launcher")]
[assembly: AssemblyVersion("0.1.3.0")]
[assembly: AssemblyFileVersion("0.1.3.0")]

// Launch cmd.exe directly: the .cmd file association is never consulted.
internal static class Launcher
{
    private const string Payload = "@EMBEDDED_CMD@";

    [STAThread]
    private static int Main(string[] args)
    {
        bool unattended = Environment.GetEnvironmentVariable("WRITER_NONINTERACTIVE") == "1";
        string helper = null;
        try
        {
            // A GUI EXE has no console when double-clicked. Do not call console
            // code-page APIs; explicit UTF-8 writers are only for captured tests.
            if (unattended)
            {
                Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true });
                Console.SetError(new StreamWriter(Console.OpenStandardError(), new UTF8Encoding(false)) { AutoFlush = true });
            }
            string action = "Start", argument = "";
            if (args.Length > 1) throw new ArgumentException("Only one launch option is allowed.");
            if (args.Length == 1)
            {
                if (args[0] == "--check") argument = "--check";
                else if (args[0] == "--diagnose") action = "Diagnose";
                else if (args[0] == "--install") action = "Install";
                else throw new ArgumentException("Supported options: --check, --diagnose, --install.");
            }
            string program = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
            if (String.IsNullOrEmpty(local)) local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (String.IsNullOrEmpty(local)) local = Path.GetTempPath();
            string helpers = Path.Combine(local, "AuthorWritingProgram", "launchers", "0.1.3");
            Directory.CreateDirectory(helpers);
            helper = Path.Combine(helpers, "start-" + Guid.NewGuid().ToString("N") + ".cmd");
            File.WriteAllBytes(helper, Convert.FromBase64String(Payload));
            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe");
            start.Arguments = "/d /v:off /c \"\"" + helper + "\" " + argument + "\"";
            start.WorkingDirectory = program;
            start.UseShellExecute = false;
            start.CreateNoWindow = unattended;
            start.EnvironmentVariables["WRITER_LAUNCH_DIR"] = program;
            start.EnvironmentVariables["WRITER_ACTION"] = action;
            // A normal double click gets a visible console. Tests collect UTF-8 output.
            start.RedirectStandardOutput = unattended;
            start.RedirectStandardError = unattended;
            if (unattended)
            {
                start.StandardOutputEncoding = new UTF8Encoding(false);
                start.StandardErrorEncoding = new UTF8Encoding(false);
            }
            using (Process child = new Process())
            {
                child.StartInfo = start;
                if (unattended)
                {
                    child.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) Console.WriteLine(e.Data); };
                    child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) Console.Error.WriteLine(e.Data); };
                }
                child.Start();
                if (unattended) { child.BeginOutputReadLine(); child.BeginErrorReadLine(); }
                child.WaitForExit();
                return child.ExitCode;
            }
        }
        catch (Exception error)
        {
            string message = "[LAUNCHER_ERROR] " + error.Message;
            if (unattended) Console.Error.WriteLine(message);
            else MessageBox.Show(message, "小说码字助手启动器", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            // Remove only this process's temporary launcher, never drafts or app data.
            if (helper != null) { try { File.Delete(helper); } catch { } }
        }
    }
}
