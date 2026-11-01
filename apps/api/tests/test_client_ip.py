from app.security import client_ip


def test_stranger_cannot_choose_the_address_with_a_header():
    assert client_ip("203.0.113.8", "1.2.3.4") == "203.0.113.8"


def test_loopback_proxy_keeps_the_first_forwarded_address():
    assert client_ip("127.0.0.1", "192.168.1.20") == "192.168.1.20"
    assert client_ip("::ffff:127.0.0.1", "192.168.1.21, 10.0.0.2") == "192.168.1.21"


def test_garbage_forwarded_header_falls_back_to_the_proxy():
    assert client_ip("127.0.0.1", "not-an-ip") == "127.0.0.1"


def test_docker_peer_is_trusted_only_when_configured(monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXIES", raising=False)
    assert client_ip("172.18.0.5", "192.168.1.9") == "172.18.0.5"
    monkeypatch.setenv("TRUSTED_PROXIES", "172.16.0.0/12")
    assert client_ip("172.18.0.5", "192.168.1.9") == "192.168.1.9"
