from torch_backend import select_device
try:
    device,name=select_device('cuda')
    print('Training device:',device,name)
except Exception as error:
    print(error)
    raise SystemExit(1)
