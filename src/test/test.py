import os
import sys
import test_module as module

print(f'{os.cpu_count() = }')
print(f'{sys.argv=}')

# %% SECTION 1
for ii in range(10):
    print(f'{ii = }')

    # %% Section 1.1
    if (ii % 3):
        print(f'Hello, World # %% {ii} !')
    else:
        # %% Section 1.2
        print('Goodbye, World!!')

# %% TEST INDENTED STATEMENT
number = 11
if number % 2 == 1:
    print('That is Odd!?')
else:
    print('Why Even?')

if number == 11:
    # %% SECTION 2.1
    print('It is what it says it is!')
else:
    # %% Just Want to Check
    print('If it did fooled you')

# %% EMPTY ZERO-CODELINE SECTION
# %% EMPTY MANY-CODELINE SECTION


# %% LAST SECTION
print('At the BOTTOM')
