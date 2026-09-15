import socket

def test(user, password):
    try:
        s = socket.create_connection(("localhost", 5432), timeout=2)
        user_b = user.encode('utf-8')
        db_b = b"postgres"
        body = b'\x00\x03\x00\x00user\x00' + user_b + b'\x00database\x00' + db_b + b'\x00\x00'
        pkt = (len(body) + 4).to_bytes(4, 'big') + body
        s.sendall(pkt)
        resp = s.recv(1024)
        if resp and resp[0:1] == b'R':
            code = int.from_bytes(resp[5:9], 'big')
            print(f"User '{user}' returned Auth Code: {code}")
        else:
            print(f"User '{user}' response: {resp}")
        s.close()
    except Exception as e:
        print(f"Error: {e}")

test("postgres", "")
test("pos_user", "")
