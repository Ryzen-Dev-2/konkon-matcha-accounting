using System.Text.Json;

namespace KonkonMatcha.Client;

public partial class MainPage : ContentPage
{
    private const string EndpointKey = "konkon-service-endpoint";
    private const string DefaultEndpoint = "https://konkon.valaxscrub.com";
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(15) };
    private Uri? allowedOrigin;

    public MainPage()
    {
        InitializeComponent();
        Loaded += async (_, _) =>
        {
            string? saved = null;
            try { saved = await SecureStorage.Default.GetAsync(EndpointKey); }
            catch
            {
                try { SecureStorage.Default.Remove(EndpointKey); }
                catch { /* The app remains usable when a device keystore is unavailable. */ }
            }
            EndpointEntry.Text = saved ?? DefaultEndpoint;
            if (saved is not null) await ConnectAsync();
        };
    }

    private async void OnConnectClicked(object? sender, EventArgs e) => await ConnectAsync();

    private async Task ConnectAsync()
    {
        ConnectionError.IsVisible = false;
        if (!ServiceEndpoint.TryNormalize(EndpointEntry.Text, out var endpoint, out var error))
        {
            ShowError(error);
            return;
        }

        ConnectButton.IsEnabled = false;
        Connecting.IsVisible = Connecting.IsRunning = true;
        try
        {
            using var response = await http.GetAsync(new Uri(endpoint, "api/setup"));
            var body = await response.Content.ReadAsStringAsync();
            using var json = JsonDocument.Parse(body);
            if (!response.IsSuccessStatusCode || !json.RootElement.TryGetProperty("ok", out var ok) || !ok.GetBoolean())
                throw new InvalidOperationException("The server did not return the Kōn-Kōn API contract.");
            try
            {
                await SecureStorage.Default.SetAsync(EndpointKey, endpoint.AbsoluteUri.TrimEnd('/'));
            }
            catch
            {
                throw new InvalidOperationException("This device could not protect the server setting. Check the system security service and try again.");
            }
            allowedOrigin = new Uri(endpoint.GetLeftPart(UriPartial.Authority));
            StatusLabel.Text = $"CONNECTED · {endpoint.Host.ToUpperInvariant()}";
            Workspace.Source = endpoint.AbsoluteUri;
            Workspace.IsVisible = true;
            ConnectPanel.IsVisible = false;
        }
        catch (Exception exception)
        {
            var message = exception is TaskCanceledException
                ? "The server did not answer within 15 seconds."
                : exception is HttpRequestException or JsonException or InvalidOperationException
                    ? $"Connection check failed. {exception.Message}"
                    : "The client could not open this service. Check the address and device WebView, then try again.";
            ShowError(message);
        }
        finally
        {
            ConnectButton.IsEnabled = true;
            Connecting.IsVisible = Connecting.IsRunning = false;
        }
    }

    private async void OnNavigating(object? sender, WebNavigatingEventArgs e)
    {
        if (!Uri.TryCreate(e.Url, UriKind.Absolute, out var target) || target.Scheme is "about" or "data") return;
        if (allowedOrigin is not null && target.Scheme == allowedOrigin.Scheme && target.Host == allowedOrigin.Host && target.Port == allowedOrigin.Port) return;
        e.Cancel = true;
        if (target.Scheme is "https" or "mailto" or "tel") await Launcher.Default.OpenAsync(target);
    }

    private void OnNavigated(object? sender, WebNavigatedEventArgs e)
    {
        if (e.Result == WebNavigationResult.Success && allowedOrigin is not null)
        {
            StatusLabel.Text = $"LIVE LEDGER · {allowedOrigin.Host.ToUpperInvariant()}";
            return;
        }
        StatusLabel.Text = "CONNECTION NEEDS ATTENTION";
        Workspace.IsVisible = false;
        ConnectPanel.IsVisible = true;
        ShowError("The device WebView could not load the workspace. Update Android System WebView or choose another service.");
    }

    private void OnBackClicked(object? sender, EventArgs e) { if (Workspace.CanGoBack) Workspace.GoBack(); }
    private void OnReloadClicked(object? sender, EventArgs e) => Workspace.Reload();
    private void OnChangeServerClicked(object? sender, EventArgs e) { Workspace.IsVisible = false; ConnectPanel.IsVisible = true; EndpointEntry.Focus(); }

    private void ShowError(string message)
    {
        ConnectionError.Text = message;
        ConnectionError.IsVisible = true;
        SemanticScreenReader.Announce(message);
    }
}
